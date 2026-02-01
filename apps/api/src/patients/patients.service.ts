import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { WhatsAppService } from '../providers/whatsapp/whatsapp.service';
import { N8nService } from '../providers/n8n/n8n.service';
import { CreatePatientDto, UpdatePatientDto } from './dto/patient.dto';
import { DataScopingContext } from '../data-scoping/dto/data-scoping.dto';
import { getVisibleDoctorProfileIds, getScopeType } from '../data-scoping/scoping.utils';

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly whatsapp: WhatsAppService,
    private readonly n8n: N8nService,
  ) {}

  /**
   * Get all patients for a hospital, filtered by data scoping context
   */
  async getPatients(hospitalId: string, accessToken: string, scopingContext?: DataScopingContext | null) {
    const scope = getScopeType(scopingContext, 'patients');

    if (scope === 'none') return [];

    if (scope === 'self_record' && scopingContext?.patientId) {
      return this.getPatientsByIds(hospitalId, [scopingContext.patientId]);
    }

    // by_doctor_scope — get patients linked to visible doctors via appointments
    if (scope === 'by_doctor_scope') {
      const visibleDoctorIds = getVisibleDoctorProfileIds(scopingContext);
      if (visibleDoctorIds && visibleDoctorIds.length > 0) {
        return this.getPatientsByDoctorScope(hospitalId, visibleDoctorIds);
      }
      return [];
    }

    // all_hospital or fallback — no filtering
    return this.getAllPatients(hospitalId, accessToken);
  }

  private async getAllPatients(hospitalId: string, accessToken: string) {
    const client = this.supabase.getClientWithToken(accessToken);

    const { data, error } = await client
      .from('patients')
      .select('*')
      .eq('hospital_id', hospitalId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new ForbiddenException(error.message);
    }

    return (data || []).map(this.mapPatient);
  }

  private async getPatientsByDoctorScope(hospitalId: string, doctorProfileIds: string[]) {
    const adminClient = this.supabase.getAdminClient();
    if (!adminClient) return [];

    const { data: appointments } = await adminClient
      .from('appointments')
      .select('patient_id')
      .eq('hospital_id', hospitalId)
      .in('doctor_profile_id', doctorProfileIds);

    const patientIds = [...new Set((appointments || []).map((a: any) => a.patient_id))];
    if (patientIds.length === 0) return [];

    return this.getPatientsByIds(hospitalId, patientIds);
  }

  private async getPatientsByIds(hospitalId: string, patientIds: string[]) {
    const adminClient = this.supabase.getAdminClient();
    if (!adminClient) return [];

    const { data, error } = await adminClient
      .from('patients')
      .select('*')
      .eq('hospital_id', hospitalId)
      .in('id', patientIds)
      .order('created_at', { ascending: false });

    if (error) {
      throw new ForbiddenException(error.message);
    }

    return (data || []).map(this.mapPatient);
  }

  /**
   * Get a specific patient
   */
  async getPatient(patientId: string, hospitalId: string, accessToken: string) {
    const client = this.supabase.getClientWithToken(accessToken);

    const { data, error } = await client
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .eq('hospital_id', hospitalId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Patient not found');
    }

    return this.mapPatient(data);
  }

  /**
   * Create a new patient
   */
  async createPatient(
    dto: CreatePatientDto,
    hospitalId: string,
    accessToken: string,
  ) {
    const client = this.supabase.getClientWithToken(accessToken);

    // Check phone uniqueness within the hospital
    if (dto.phone) {
      const { data: existing } = await client
        .from('patients')
        .select('id')
        .eq('hospital_id', hospitalId)
        .eq('phone', dto.phone)
        .limit(1);

      if (existing && existing.length > 0) {
        throw new ConflictException('This phone number already exists for another patient');
      }
    }

    const { data, error } = await client
      .from('patients')
      .insert({
        hospital_id: hospitalId,
        first_name: dto.firstName,
        last_name: dto.lastName,
        email: dto.email || null,
        phone: dto.phone || null,
        date_of_birth: dto.dateOfBirth || null,
        gender: dto.gender || null,
        address: dto.address || null,
        city: dto.city || null,
        state: dto.state || null,
        postal_code: dto.postalCode || null,
        insurance_provider: dto.insuranceProvider || null,
        insurance_number: dto.insuranceNumber || null,
        emergency_contact_name: dto.emergencyContactName || null,
        emergency_contact_phone: dto.emergencyContactPhone || null,
        notes: dto.notes || null,
        status: dto.status || 'active',
      })
      .select()
      .single();

    if (error) {
      throw new ForbiddenException(error.message);
    }

    const patient = this.mapPatient(data);

    // Send WhatsApp welcome notification (non-blocking)
    if (dto.phone && this.whatsapp.isEnabled()) {
      this.sendPatientWhatsAppNotification(dto.phone, patient, hospitalId).catch(err => {
        this.logger.error(`Failed to send WhatsApp notification: ${err.message}`);
      });
    }

    // Trigger n8n webhook (non-blocking)
    this.triggerN8nPatientCreated(patient, hospitalId).catch(err => {
      this.logger.error(`Failed to trigger n8n webhook: ${err.message}`);
    });

    return patient;
  }

  /**
   * Send WhatsApp welcome message to newly created patient
   */
  private async sendPatientWhatsAppNotification(
    phone: string,
    patient: any,
    hospitalId: string,
  ) {
    try {
      // Fetch hospital name for the message
      const adminClient = this.supabase.getAdminClient();
      const { data: hospital } = await adminClient
        .from('hospitals')
        .select('name')
        .eq('id', hospitalId)
        .single();

      const hospitalName = hospital?.name || 'our hospital';
      const patientName = `${patient.firstName} ${patient.lastName}`.trim();

      const result = await this.whatsapp.sendPatientWelcome(
        phone,
        patientName,
        hospitalName,
      );

      if (result.success) {
        this.logger.log(`WhatsApp welcome sent to patient ${patient.id} (${phone})`);

        // Log notification in database
        await adminClient.from('whatsapp_notifications').insert({
          hospital_id: hospitalId,
          patient_id: patient.id,
          recipient_phone: phone,
          template_name: 'patient_welcome',
          status: 'sent',
          wa_message_id: result.messageId,
        });
      } else {
        this.logger.warn(`WhatsApp welcome failed for patient ${patient.id}: ${result.error}`);

        await adminClient.from('whatsapp_notifications').insert({
          hospital_id: hospitalId,
          patient_id: patient.id,
          recipient_phone: phone,
          template_name: 'patient_welcome',
          status: 'failed',
          error_message: result.error,
        });
      }
    } catch (err) {
      this.logger.error(`WhatsApp notification error for patient in hospital ${hospitalId}: ${err}`);
    }
  }

  private async triggerN8nPatientCreated(patient: any, hospitalId: string) {
    try {
      const adminClient = this.supabase.getAdminClient();
      let hospitalName = '';
      if (adminClient) {
        const { data: hospital } = await adminClient
          .from('hospitals')
          .select('name')
          .eq('id', hospitalId)
          .single();
        hospitalName = hospital?.name || '';
      }

      await this.n8n.onPatientCreated({
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        phone: patient.phone,
        email: patient.email,
        hospitalId,
        hospitalName,
      });
    } catch (err) {
      this.logger.error(`n8n webhook error for patient ${patient.id}: ${err}`);
    }
  }

  /**
   * Update a patient
   */
  async updatePatient(
    patientId: string,
    dto: UpdatePatientDto,
    hospitalId: string,
    accessToken: string,
  ) {
    const client = this.supabase.getClientWithToken(accessToken);

    // Check phone uniqueness within the hospital (exclude current patient)
    if (dto.phone) {
      const { data: existing } = await client
        .from('patients')
        .select('id')
        .eq('hospital_id', hospitalId)
        .eq('phone', dto.phone)
        .neq('id', patientId)
        .limit(1);

      if (existing && existing.length > 0) {
        throw new ConflictException('This phone number already exists for another patient');
      }
    }

    // Build update object with only provided fields
    const updateData: Record<string, any> = {};
    if (dto.firstName !== undefined) updateData.first_name = dto.firstName;
    if (dto.lastName !== undefined) updateData.last_name = dto.lastName;
    if (dto.email !== undefined) updateData.email = dto.email || null;
    if (dto.phone !== undefined) updateData.phone = dto.phone || null;
    if (dto.dateOfBirth !== undefined) updateData.date_of_birth = dto.dateOfBirth || null;
    if (dto.gender !== undefined) updateData.gender = dto.gender || null;
    if (dto.address !== undefined) updateData.address = dto.address || null;
    if (dto.city !== undefined) updateData.city = dto.city || null;
    if (dto.state !== undefined) updateData.state = dto.state || null;
    if (dto.postalCode !== undefined) updateData.postal_code = dto.postalCode || null;
    if (dto.insuranceProvider !== undefined) updateData.insurance_provider = dto.insuranceProvider || null;
    if (dto.insuranceNumber !== undefined) updateData.insurance_number = dto.insuranceNumber || null;
    if (dto.emergencyContactName !== undefined) updateData.emergency_contact_name = dto.emergencyContactName || null;
    if (dto.emergencyContactPhone !== undefined) updateData.emergency_contact_phone = dto.emergencyContactPhone || null;
    if (dto.notes !== undefined) updateData.notes = dto.notes || null;
    if (dto.status !== undefined) updateData.status = dto.status;

    const { data, error } = await client
      .from('patients')
      .update(updateData)
      .eq('id', patientId)
      .eq('hospital_id', hospitalId)
      .select()
      .single();

    if (error) {
      throw new ForbiddenException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Patient not found');
    }

    return this.mapPatient(data);
  }

  /**
   * Delete a patient
   */
  async deletePatient(
    patientId: string,
    hospitalId: string,
    accessToken: string,
  ) {
    const client = this.supabase.getClientWithToken(accessToken);

    const { error } = await client
      .from('patients')
      .delete()
      .eq('id', patientId)
      .eq('hospital_id', hospitalId);

    if (error) {
      throw new ForbiddenException(error.message);
    }

    return { success: true };
  }

  /**
   * Map database record to API response
   */
  private mapPatient(record: any) {
    return {
      id: record.id,
      firstName: record.first_name,
      lastName: record.last_name,
      email: record.email,
      phone: record.phone,
      dateOfBirth: record.date_of_birth,
      gender: record.gender,
      address: record.address,
      city: record.city,
      state: record.state,
      postalCode: record.postal_code,
      insuranceProvider: record.insurance_provider,
      insuranceNumber: record.insurance_number,
      emergencyContactName: record.emergency_contact_name,
      emergencyContactPhone: record.emergency_contact_phone,
      notes: record.notes,
      status: record.status,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }
}
