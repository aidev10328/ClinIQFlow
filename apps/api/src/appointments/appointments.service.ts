import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  GenerateSlotsDto,
  GetSlotsQueryDto,
  SlotResponseDto,
  SlotsForDateDto,
  GenerateSlotsResponseDto,
  SlotPeriod,
  SlotStatus,
  CalendarDayDto,
} from './dto/slot.dto';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  CancelAppointmentDto,
  GetAppointmentsQueryDto,
  AppointmentResponseDto,
  AppointmentStatsDto,
  AppointmentStatus,
} from './dto/appointment.dto';

interface DoctorSchedule {
  dayOfWeek: number;
  isWorking: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
}

interface TimeOff {
  startDate: string;
  endDate: string;
}

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(private supabaseService: SupabaseService) {}

  /**
   * Generate appointment slots for a doctor within a date range
   */
  async generateSlots(
    dto: GenerateSlotsDto,
    hospitalId: string,
    userId: string,
    accessToken: string,
  ): Promise<GenerateSlotsResponseDto> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    // Verify doctor profile exists and belongs to hospital
    const { data: doctorProfile, error: profileError } = await adminClient
      .from('doctor_profiles')
      .select('id, user_id, hospital_id, appointment_duration_minutes')
      .eq('id', dto.doctorProfileId)
      .eq('hospital_id', hospitalId)
      .single();

    if (profileError || !doctorProfile) {
      throw new NotFoundException('Doctor profile not found');
    }

    const durationMinutes = doctorProfile.appointment_duration_minutes || 30;

    // Get doctor's weekly schedules
    const { data: schedules, error: scheduleError } = await adminClient
      .from('doctor_schedules')
      .select('day_of_week, is_working, shift_start, shift_end')
      .eq('doctor_profile_id', dto.doctorProfileId);

    this.logger.log(`[generateSlots] Doctor profile: ${dto.doctorProfileId}`);
    this.logger.log(`[generateSlots] Schedules query result: ${JSON.stringify(schedules)}, error: ${scheduleError?.message}`);

    const scheduleMap = new Map<number, DoctorSchedule>();
    (schedules || []).forEach((s: any) => {
      scheduleMap.set(s.day_of_week, {
        dayOfWeek: s.day_of_week,
        isWorking: s.is_working,
        shiftStart: s.shift_start,
        shiftEnd: s.shift_end,
      });
    });

    this.logger.log(`[generateSlots] Schedule map size: ${scheduleMap.size}`);

    // Get doctor's time-off in date range
    const { data: timeOffs } = await adminClient
      .from('doctor_time_off')
      .select('start_date, end_date')
      .eq('doctor_profile_id', dto.doctorProfileId)
      .eq('status', 'approved')
      .or(`start_date.lte.${dto.endDate},end_date.gte.${dto.startDate}`);

    const timeOffRanges: TimeOff[] = (timeOffs || []).map((t: any) => ({
      startDate: t.start_date,
      endDate: t.end_date,
    }));

    // Get existing slots to avoid duplicates
    const { data: existingSlots } = await adminClient
      .from('appointment_slots')
      .select('slot_date, start_time')
      .eq('doctor_profile_id', dto.doctorProfileId)
      .gte('slot_date', dto.startDate)
      .lte('slot_date', dto.endDate);

    const existingSlotKeys = new Set(
      (existingSlots || []).map((s: any) => `${s.slot_date}-${s.start_time}`),
    );

    // Generate slots
    const slotsToCreate: any[] = [];
    let slotsSkipped = 0;

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay(); // 0 = Sunday

      // Check if doctor works on this day
      const schedule = scheduleMap.get(dayOfWeek);
      if (!schedule || !schedule.isWorking || !schedule.shiftStart || !schedule.shiftEnd) {
        continue;
      }

      // Check if doctor is on time-off
      if (this.isDateInTimeOff(dateStr, timeOffRanges)) {
        continue;
      }

      // Generate slots for this day
      const daySlots = this.generateDaySlots(
        dateStr,
        schedule.shiftStart,
        schedule.shiftEnd,
        durationMinutes,
        hospitalId,
        dto.doctorProfileId,
      );

      for (const slot of daySlots) {
        const slotKey = `${slot.slot_date}-${slot.start_time}`;
        if (existingSlotKeys.has(slotKey)) {
          slotsSkipped++;
        } else {
          slotsToCreate.push(slot);
          existingSlotKeys.add(slotKey);
        }
      }
    }

    // Bulk insert slots
    if (slotsToCreate.length > 0) {
      const { error: insertError } = await adminClient
        .from('appointment_slots')
        .insert(slotsToCreate);

      if (insertError) {
        this.logger.error(`Failed to insert slots: ${insertError.message}`);
        throw new BadRequestException('Failed to generate slots');
      }
    }

    return {
      slotsGenerated: slotsToCreate.length,
      slotsSkipped,
      startDate: dto.startDate,
      endDate: dto.endDate,
      doctorProfileId: dto.doctorProfileId,
    };
  }

  /**
   * Get slots for a specific date
   */
  async getSlotsForDate(
    doctorProfileId: string,
    date: string,
    hospitalId: string,
    accessToken: string,
  ): Promise<SlotsForDateDto> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    // Get slots for this date
    const { data: slots, error } = await adminClient
      .from('appointment_slots')
      .select(`
        id,
        hospital_id,
        doctor_profile_id,
        slot_date,
        start_time,
        end_time,
        duration_minutes,
        period,
        status,
        created_at
      `)
      .eq('doctor_profile_id', doctorProfileId)
      .eq('hospital_id', hospitalId)
      .eq('slot_date', date)
      .order('start_time');

    if (error) {
      this.logger.error(`Failed to fetch slots: ${error.message}`);
      throw new BadRequestException('Failed to fetch slots');
    }

    // Get doctor name
    const { data: doctorProfile } = await adminClient
      .from('doctor_profiles')
      .select('user_id')
      .eq('id', doctorProfileId)
      .single();

    let doctorName = 'Unknown';
    if (doctorProfile) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('full_name')
        .eq('user_id', doctorProfile.user_id)
        .single();
      doctorName = profile?.full_name || 'Unknown';
    }

    // Get appointments for booked slots
    const slotIds = (slots || []).map((s: any) => s.id);
    const { data: appointments } = await adminClient
      .from('appointments')
      .select('slot_id, id, patient_id')
      .in('slot_id', slotIds.length > 0 ? slotIds : ['00000000-0000-0000-0000-000000000000']);

    const appointmentMap = new Map<string, any>();
    (appointments || []).forEach((a: any) => {
      appointmentMap.set(a.slot_id, a);
    });

    // Get patient names for booked appointments
    const patientIds = (appointments || []).map((a: any) => a.patient_id);
    const { data: patients } = await adminClient
      .from('patients')
      .select('id, first_name, last_name')
      .in('id', patientIds.length > 0 ? patientIds : ['00000000-0000-0000-0000-000000000000']);

    const patientMap = new Map<string, string>();
    (patients || []).forEach((p: any) => {
      patientMap.set(p.id, `${p.first_name} ${p.last_name}`);
    });

    // Map slots to response DTOs
    const slotResponses: SlotResponseDto[] = (slots || []).map((s: any) => {
      const appointment = appointmentMap.get(s.id);
      return {
        id: s.id,
        hospitalId: s.hospital_id,
        doctorProfileId: s.doctor_profile_id,
        doctorName,
        slotDate: s.slot_date,
        startTime: s.start_time,
        endTime: s.end_time,
        durationMinutes: s.duration_minutes,
        period: s.period as SlotPeriod,
        status: s.status as SlotStatus,
        appointmentId: appointment?.id,
        patientId: appointment?.patient_id,
        patientName: appointment ? patientMap.get(appointment.patient_id) : undefined,
        createdAt: s.created_at,
      };
    });

    // Group by period
    const morning = slotResponses.filter((s) => s.period === SlotPeriod.MORNING);
    const evening = slotResponses.filter((s) => s.period === SlotPeriod.EVENING);
    const night = slotResponses.filter((s) => s.period === SlotPeriod.NIGHT);

    // Calculate stats
    const stats = {
      total: slotResponses.length,
      available: slotResponses.filter((s) => s.status === SlotStatus.AVAILABLE).length,
      booked: slotResponses.filter((s) => s.status === SlotStatus.BOOKED).length,
      blocked: slotResponses.filter((s) => s.status === SlotStatus.BLOCKED).length,
    };

    // Format date
    const dateObj = new Date(date);
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return {
      date,
      formattedDate,
      morning,
      evening,
      night,
      stats,
    };
  }

  /**
   * Get calendar overview for a month
   */
  async getCalendarOverview(
    doctorProfileId: string,
    year: number,
    month: number,
    hospitalId: string,
    accessToken: string,
  ): Promise<CalendarDayDto[]> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    // Calculate start and end of month
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    // Get all slots for the month
    const { data: slots } = await adminClient
      .from('appointment_slots')
      .select('slot_date, status')
      .eq('doctor_profile_id', doctorProfileId)
      .eq('hospital_id', hospitalId)
      .gte('slot_date', startDate)
      .lte('slot_date', endDate);

    // Group by date
    const dateMap = new Map<string, { available: number; booked: number }>();
    (slots || []).forEach((s: any) => {
      if (!dateMap.has(s.slot_date)) {
        dateMap.set(s.slot_date, { available: 0, booked: 0 });
      }
      const day = dateMap.get(s.slot_date)!;
      if (s.status === 'AVAILABLE') {
        day.available++;
      } else if (s.status === 'BOOKED') {
        day.booked++;
      }
    });

    // Build calendar days
    const calendarDays: CalendarDayDto[] = [];
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayData = dateMap.get(dateStr);
      calendarDays.push({
        date: dateStr,
        hasSlots: !!dayData && (dayData.available > 0 || dayData.booked > 0),
        availableCount: dayData?.available || 0,
        bookedCount: dayData?.booked || 0,
      });
    }

    return calendarDays;
  }

  /**
   * Get appointment counts per date for calendar display
   */
  async getCalendarAppointmentCounts(
    doctorProfileId: string,
    startDate: string,
    endDate: string,
    hospitalId: string,
  ): Promise<{ date: string; count: number }[]> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    // Get all appointments in the date range
    const { data: appointments } = await adminClient
      .from('appointments')
      .select('appointment_date')
      .eq('doctor_profile_id', doctorProfileId)
      .eq('hospital_id', hospitalId)
      .gte('appointment_date', startDate)
      .lte('appointment_date', endDate)
      .not('status', 'eq', 'CANCELLED');

    // Count appointments per date
    const countMap = new Map<string, number>();
    (appointments || []).forEach((a: any) => {
      const date = a.appointment_date;
      countMap.set(date, (countMap.get(date) || 0) + 1);
    });

    // Convert to array
    const result: { date: string; count: number }[] = [];
    countMap.forEach((count, date) => {
      result.push({ date, count });
    });

    return result;
  }

  /**
   * Block a slot
   */
  async blockSlot(
    slotId: string,
    hospitalId: string,
    userId: string,
    accessToken: string,
  ): Promise<SlotResponseDto> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    // Get slot
    const { data: slot, error } = await adminClient
      .from('appointment_slots')
      .select('*')
      .eq('id', slotId)
      .eq('hospital_id', hospitalId)
      .single();

    if (error || !slot) {
      throw new NotFoundException('Slot not found');
    }

    if (slot.status !== 'AVAILABLE') {
      throw new BadRequestException('Slot is not available');
    }

    // Update slot status
    const { error: updateError } = await adminClient
      .from('appointment_slots')
      .update({ status: 'BLOCKED' })
      .eq('id', slotId);

    if (updateError) {
      throw new BadRequestException('Failed to block slot');
    }

    return this.getSlotById(slotId, hospitalId, accessToken);
  }

  /**
   * Unblock a slot
   */
  async unblockSlot(
    slotId: string,
    hospitalId: string,
    userId: string,
    accessToken: string,
  ): Promise<SlotResponseDto> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    // Get slot
    const { data: slot, error } = await adminClient
      .from('appointment_slots')
      .select('*')
      .eq('id', slotId)
      .eq('hospital_id', hospitalId)
      .single();

    if (error || !slot) {
      throw new NotFoundException('Slot not found');
    }

    if (slot.status !== 'BLOCKED') {
      throw new BadRequestException('Slot is not blocked');
    }

    // Update slot status
    const { error: updateError } = await adminClient
      .from('appointment_slots')
      .update({ status: 'AVAILABLE' })
      .eq('id', slotId);

    if (updateError) {
      throw new BadRequestException('Failed to unblock slot');
    }

    return this.getSlotById(slotId, hospitalId, accessToken);
  }

  /**
   * Book an appointment
   */
  async createAppointment(
    dto: CreateAppointmentDto,
    hospitalId: string,
    userId: string,
    accessToken: string,
  ): Promise<AppointmentResponseDto> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    // Get slot
    const { data: slot, error: slotError } = await adminClient
      .from('appointment_slots')
      .select('*')
      .eq('id', dto.slotId)
      .eq('hospital_id', hospitalId)
      .single();

    if (slotError || !slot) {
      throw new NotFoundException('Slot not found');
    }

    if (slot.status !== 'AVAILABLE') {
      throw new BadRequestException('Slot is not available for booking');
    }

    // Verify patient exists
    const { data: patient, error: patientError } = await adminClient
      .from('patients')
      .select('id')
      .eq('id', dto.patientId)
      .eq('hospital_id', hospitalId)
      .single();

    if (patientError || !patient) {
      throw new NotFoundException('Patient not found');
    }

    // Create appointment
    const { data: appointment, error: appointmentError } = await adminClient
      .from('appointments')
      .insert({
        hospital_id: hospitalId,
        slot_id: dto.slotId,
        patient_id: dto.patientId,
        doctor_profile_id: slot.doctor_profile_id,
        appointment_date: slot.slot_date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        status: 'SCHEDULED',
        reason_for_visit: dto.reasonForVisit || null,
        notes: dto.notes || null,
        booked_by_user_id: userId,
      })
      .select()
      .single();

    if (appointmentError) {
      this.logger.error(`Failed to create appointment: ${appointmentError.message}`);
      throw new BadRequestException('Failed to create appointment');
    }

    // Update slot status to BOOKED
    await adminClient
      .from('appointment_slots')
      .update({ status: 'BOOKED' })
      .eq('id', dto.slotId);

    return this.getAppointmentById(appointment.id, hospitalId, accessToken);
  }

  /**
   * Get appointment by ID
   */
  async getAppointmentById(
    appointmentId: string,
    hospitalId: string,
    accessToken: string,
  ): Promise<AppointmentResponseDto> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    const { data: appointment, error } = await adminClient
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .eq('hospital_id', hospitalId)
      .single();

    if (error || !appointment) {
      throw new NotFoundException('Appointment not found');
    }

    // Get patient info
    const { data: patient } = await adminClient
      .from('patients')
      .select('first_name, last_name, phone, email')
      .eq('id', appointment.patient_id)
      .single();

    // Get doctor info
    const { data: doctorProfile } = await adminClient
      .from('doctor_profiles')
      .select('user_id, specialization')
      .eq('id', appointment.doctor_profile_id)
      .single();

    let doctorName = 'Unknown';
    if (doctorProfile) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('full_name')
        .eq('user_id', doctorProfile.user_id)
        .single();
      doctorName = profile?.full_name || 'Unknown';
    }

    // Get booked by user name
    let bookedByName: string | undefined;
    if (appointment.booked_by_user_id) {
      const { data: bookerProfile } = await adminClient
        .from('profiles')
        .select('full_name')
        .eq('user_id', appointment.booked_by_user_id)
        .single();
      bookedByName = bookerProfile?.full_name;
    }

    return {
      id: appointment.id,
      hospitalId: appointment.hospital_id,
      slotId: appointment.slot_id,
      patientId: appointment.patient_id,
      patientName: patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown',
      patientPhone: patient?.phone,
      patientEmail: patient?.email,
      doctorProfileId: appointment.doctor_profile_id,
      doctorName,
      doctorSpecialization: doctorProfile?.specialization,
      appointmentDate: appointment.appointment_date,
      startTime: appointment.start_time,
      endTime: appointment.end_time,
      status: appointment.status as AppointmentStatus,
      reasonForVisit: appointment.reason_for_visit,
      notes: appointment.notes,
      cancellationReason: appointment.cancellation_reason,
      bookedAt: appointment.booked_at,
      bookedByUserId: appointment.booked_by_user_id,
      bookedByName,
      createdAt: appointment.created_at,
    };
  }

  /**
   * Get appointments list
   */
  async getAppointments(
    query: GetAppointmentsQueryDto,
    hospitalId: string,
    accessToken: string,
  ): Promise<AppointmentResponseDto[]> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    let queryBuilder = adminClient
      .from('appointments')
      .select('*')
      .eq('hospital_id', hospitalId)
      .order('appointment_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (query.doctorProfileId) {
      queryBuilder = queryBuilder.eq('doctor_profile_id', query.doctorProfileId);
    }
    if (query.patientId) {
      queryBuilder = queryBuilder.eq('patient_id', query.patientId);
    }
    // Support single date parameter (for specific date queries)
    if (query.date) {
      queryBuilder = queryBuilder.eq('appointment_date', query.date);
    } else {
      // Or use date range
      if (query.startDate) {
        queryBuilder = queryBuilder.gte('appointment_date', query.startDate);
      }
      if (query.endDate) {
        queryBuilder = queryBuilder.lte('appointment_date', query.endDate);
      }
    }
    if (query.status) {
      queryBuilder = queryBuilder.eq('status', query.status);
    }

    const { data: appointments, error } = await queryBuilder;

    if (error) {
      this.logger.error(`Failed to fetch appointments: ${error.message}`);
      throw new BadRequestException('Failed to fetch appointments');
    }

    // Batch fetch related data
    const patientIds = [...new Set((appointments || []).map((a: any) => a.patient_id))];
    const doctorProfileIds = [...new Set((appointments || []).map((a: any) => a.doctor_profile_id))];

    const { data: patients } = await adminClient
      .from('patients')
      .select('id, first_name, last_name, phone, email')
      .in('id', patientIds.length > 0 ? patientIds : ['00000000-0000-0000-0000-000000000000']);

    const { data: doctorProfiles } = await adminClient
      .from('doctor_profiles')
      .select('id, user_id, specialization')
      .in('id', doctorProfileIds.length > 0 ? doctorProfileIds : ['00000000-0000-0000-0000-000000000000']);

    const doctorUserIds = (doctorProfiles || []).map((d: any) => d.user_id);
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', doctorUserIds.length > 0 ? doctorUserIds : ['00000000-0000-0000-0000-000000000000']);

    // Create lookup maps
    const patientMap = new Map<string, any>();
    (patients || []).forEach((p: any) => patientMap.set(p.id, p));

    const profileMap = new Map<string, string>();
    (profiles || []).forEach((p: any) => profileMap.set(p.user_id, p.full_name));

    const doctorMap = new Map<string, any>();
    (doctorProfiles || []).forEach((d: any) => {
      doctorMap.set(d.id, {
        name: profileMap.get(d.user_id) || 'Unknown',
        specialization: d.specialization,
      });
    });

    return (appointments || []).map((a: any) => {
      const patient = patientMap.get(a.patient_id);
      const doctor = doctorMap.get(a.doctor_profile_id);

      return {
        id: a.id,
        hospitalId: a.hospital_id,
        slotId: a.slot_id,
        patientId: a.patient_id,
        patientName: patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown',
        patientPhone: patient?.phone,
        patientEmail: patient?.email,
        doctorProfileId: a.doctor_profile_id,
        doctorName: doctor?.name || 'Unknown',
        doctorSpecialization: doctor?.specialization,
        appointmentDate: a.appointment_date,
        startTime: a.start_time,
        endTime: a.end_time,
        status: a.status as AppointmentStatus,
        reasonForVisit: a.reason_for_visit,
        notes: a.notes,
        cancellationReason: a.cancellation_reason,
        bookedAt: a.booked_at,
        bookedByUserId: a.booked_by_user_id,
        createdAt: a.created_at,
      };
    });
  }

  /**
   * Update appointment
   */
  async updateAppointment(
    appointmentId: string,
    dto: UpdateAppointmentDto,
    hospitalId: string,
    userId: string,
    accessToken: string,
  ): Promise<AppointmentResponseDto> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    // Get existing appointment
    const { data: existing, error } = await adminClient
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .eq('hospital_id', hospitalId)
      .single();

    if (error || !existing) {
      throw new NotFoundException('Appointment not found');
    }

    const updateData: any = {};
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.reasonForVisit !== undefined) updateData.reason_for_visit = dto.reasonForVisit;

    if (dto.status === AppointmentStatus.COMPLETED) {
      updateData.completed_at = new Date().toISOString();
    }

    const { error: updateError } = await adminClient
      .from('appointments')
      .update(updateData)
      .eq('id', appointmentId);

    if (updateError) {
      throw new BadRequestException('Failed to update appointment');
    }

    return this.getAppointmentById(appointmentId, hospitalId, accessToken);
  }

  /**
   * Cancel appointment
   */
  async cancelAppointment(
    appointmentId: string,
    dto: CancelAppointmentDto,
    hospitalId: string,
    userId: string,
    accessToken: string,
  ): Promise<AppointmentResponseDto> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    // Get existing appointment
    const { data: existing, error } = await adminClient
      .from('appointments')
      .select('*, slot_id')
      .eq('id', appointmentId)
      .eq('hospital_id', hospitalId)
      .single();

    if (error || !existing) {
      throw new NotFoundException('Appointment not found');
    }

    if (existing.status === 'CANCELLED') {
      throw new BadRequestException('Appointment is already cancelled');
    }

    // Update appointment status
    const { error: updateError } = await adminClient
      .from('appointments')
      .update({
        status: 'CANCELLED',
        cancellation_reason: dto.cancellationReason || null,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', appointmentId);

    if (updateError) {
      throw new BadRequestException('Failed to cancel appointment');
    }

    // Update slot status back to AVAILABLE
    await adminClient
      .from('appointment_slots')
      .update({ status: 'AVAILABLE' })
      .eq('id', existing.slot_id);

    return this.getAppointmentById(appointmentId, hospitalId, accessToken);
  }

  /**
   * Get appointment stats
   */
  async getStats(
    doctorProfileId: string,
    date: string,
    hospitalId: string,
    accessToken: string,
  ): Promise<AppointmentStatsDto> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    // Get slots for the date
    const { data: slots } = await adminClient
      .from('appointment_slots')
      .select('status')
      .eq('doctor_profile_id', doctorProfileId)
      .eq('hospital_id', hospitalId)
      .eq('slot_date', date);

    // Get appointments for the date
    const { data: appointments } = await adminClient
      .from('appointments')
      .select('status')
      .eq('doctor_profile_id', doctorProfileId)
      .eq('hospital_id', hospitalId)
      .eq('appointment_date', date);

    const slotStats = {
      total: (slots || []).length,
      available: (slots || []).filter((s: any) => s.status === 'AVAILABLE').length,
      booked: (slots || []).filter((s: any) => s.status === 'BOOKED').length,
    };

    const appointmentStats = {
      scheduled: (appointments || []).filter((a: any) => a.status === 'SCHEDULED').length,
      completed: (appointments || []).filter((a: any) => a.status === 'COMPLETED').length,
      cancelled: (appointments || []).filter((a: any) => a.status === 'CANCELLED').length,
      noShow: (appointments || []).filter((a: any) => a.status === 'NO_SHOW').length,
    };

    return {
      total: slotStats.total,
      available: slotStats.available,
      booked: slotStats.booked,
      scheduled: appointmentStats.scheduled,
      completed: appointmentStats.completed,
      cancelled: appointmentStats.cancelled,
      noShow: appointmentStats.noShow,
    };
  }

  /**
   * Get doctors with appointments license for dropdown
   */
  async getDoctorsWithLicense(
    hospitalId: string,
    userId: string,
    accessToken: string,
  ): Promise<any[]> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    // Get the user's role and assigned doctors (for staff)
    const { data: membership } = await adminClient
      .from('hospital_memberships')
      .select('role, assigned_doctor_ids')
      .eq('hospital_id', hospitalId)
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .single();

    // Get APPOINTMENTS product ID
    const { data: product } = await adminClient
      .from('products')
      .select('id')
      .eq('code', 'APPOINTMENTS')
      .single();

    if (!product) {
      return [];
    }

    // Get doctors with active APPOINTMENTS license
    const { data: licenses } = await adminClient
      .from('doctor_product_licenses')
      .select('doctor_user_id')
      .eq('hospital_id', hospitalId)
      .eq('product_id', product.id)
      .eq('status', 'ACTIVE');

    const licensedUserIds = (licenses || []).map((l: any) => l.doctor_user_id);

    if (licensedUserIds.length === 0) {
      return [];
    }

    // Get doctor profiles
    const { data: doctorProfiles } = await adminClient
      .from('doctor_profiles')
      .select('id, user_id, specialization, appointment_duration_minutes')
      .eq('hospital_id', hospitalId)
      .in('user_id', licensedUserIds);

    // Get profile names
    const userIds = (doctorProfiles || []).map((d: any) => d.user_id);
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000']);

    const profileMap = new Map<string, string>();
    (profiles || []).forEach((p: any) => profileMap.set(p.user_id, p.full_name));

    let doctors = (doctorProfiles || []).map((d: any) => ({
      id: d.id,
      userId: d.user_id,
      name: profileMap.get(d.user_id) || 'Unknown',
      specialization: d.specialization,
      appointmentDurationMinutes: d.appointment_duration_minutes || 30,
    }));

    // If staff, filter to assigned doctors only
    if (membership?.role === 'STAFF' && membership.assigned_doctor_ids) {
      doctors = doctors.filter((d) => membership.assigned_doctor_ids.includes(d.userId));
    }

    return doctors;
  }

  // ============ Private Helper Methods ============

  private isDateInTimeOff(date: string, timeOffs: TimeOff[]): boolean {
    for (const to of timeOffs) {
      if (date >= to.startDate && date <= to.endDate) {
        return true;
      }
    }
    return false;
  }

  private generateDaySlots(
    date: string,
    shiftStart: string,
    shiftEnd: string,
    durationMinutes: number,
    hospitalId: string,
    doctorProfileId: string,
  ): any[] {
    const slots: any[] = [];

    const startMinutes = this.timeToMinutes(shiftStart);
    const endMinutes = this.timeToMinutes(shiftEnd);

    let currentMinutes = startMinutes;

    while (currentMinutes + durationMinutes <= endMinutes) {
      const startTime = this.minutesToTime(currentMinutes);
      const endTime = this.minutesToTime(currentMinutes + durationMinutes);
      const period = this.getPeriodFromTime(startTime);

      slots.push({
        hospital_id: hospitalId,
        doctor_profile_id: doctorProfileId,
        slot_date: date,
        start_time: startTime,
        end_time: endTime,
        duration_minutes: durationMinutes,
        period,
        status: 'AVAILABLE',
      });

      currentMinutes += durationMinutes;
    }

    return slots;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
  }

  private getPeriodFromTime(time: string): string {
    const hour = parseInt(time.split(':')[0], 10);

    if (hour >= 6 && hour < 12) return 'MORNING';
    if (hour >= 12 && hour < 22) return 'EVENING';
    return 'NIGHT';
  }

  private async getSlotById(
    slotId: string,
    hospitalId: string,
    accessToken: string,
  ): Promise<SlotResponseDto> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    const { data: slot, error } = await adminClient
      .from('appointment_slots')
      .select('*')
      .eq('id', slotId)
      .eq('hospital_id', hospitalId)
      .single();

    if (error || !slot) {
      throw new NotFoundException('Slot not found');
    }

    // Get doctor name
    const { data: doctorProfile } = await adminClient
      .from('doctor_profiles')
      .select('user_id')
      .eq('id', slot.doctor_profile_id)
      .single();

    let doctorName = 'Unknown';
    if (doctorProfile) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('full_name')
        .eq('user_id', doctorProfile.user_id)
        .single();
      doctorName = profile?.full_name || 'Unknown';
    }

    return {
      id: slot.id,
      hospitalId: slot.hospital_id,
      doctorProfileId: slot.doctor_profile_id,
      doctorName,
      slotDate: slot.slot_date,
      startTime: slot.start_time,
      endTime: slot.end_time,
      durationMinutes: slot.duration_minutes,
      period: slot.period as SlotPeriod,
      status: slot.status as SlotStatus,
      createdAt: slot.created_at,
    };
  }
}
