import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreatePatientDto, UpdatePatientDto } from './dto/patient.dto';
import { DataScopingContext } from '../data-scoping/dto/data-scoping.dto';
import { getVisibleDoctorProfileIds, getScopeType } from '../data-scoping/scoping.utils';

@Injectable()
export class PatientsService {
  constructor(private readonly supabase: SupabaseService) {}

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
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true });

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
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true });

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

    return this.mapPatient(data);
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
