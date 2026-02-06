import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { DataScopingContext } from '../data-scoping/dto/data-scoping.dto';
import { getVisibleDoctorProfileIds, getScopeType } from '../data-scoping/scoping.utils';
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
      .select('id, user_id, hospital_id, appointment_duration_minutes, shift_timing_config')
      .eq('id', dto.doctorProfileId)
      .eq('hospital_id', hospitalId)
      .single();

    if (profileError || !doctorProfile) {
      throw new NotFoundException('Doctor profile not found');
    }

    const durationMinutes = doctorProfile.appointment_duration_minutes || 30;
    const shiftTimingConfig = doctorProfile.shift_timing_config || null;

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

    for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getUTCDay(); // 0 = Sunday

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
        shiftTimingConfig,
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

    // Bulk insert slots in batches of 500 to avoid Supabase row limits
    // Use upsert with onConflict to gracefully handle any duplicate slots
    if (slotsToCreate.length > 0) {
      const BATCH_SIZE = 500;
      let insertedCount = 0;
      for (let i = 0; i < slotsToCreate.length; i += BATCH_SIZE) {
        const batch = slotsToCreate.slice(i, i + BATCH_SIZE);
        const { error: insertError, count } = await adminClient
          .from('appointment_slots')
          .upsert(batch, {
            onConflict: 'doctor_profile_id,slot_date,start_time',
            ignoreDuplicates: true,
            count: 'exact',
          });

        if (insertError) {
          this.logger.error(`Failed to insert slots batch ${Math.floor(i / BATCH_SIZE) + 1}: ${insertError.message}`);
          throw new BadRequestException('Failed to generate slots');
        }
        insertedCount += count || batch.length;
      }
      this.logger.log(`[generateSlots] Inserted ${insertedCount} slots in ${Math.ceil(slotsToCreate.length / BATCH_SIZE)} batches`);
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

    // Check if this day is a working day according to the doctor's schedule
    const checkDate = new Date(date + 'T00:00:00Z');
    const dayOfWeek = checkDate.getUTCDay(); // 0 = Sunday, 6 = Saturday

    const { data: scheduleEntry } = await adminClient
      .from('doctor_schedules')
      .select('is_working')
      .eq('doctor_profile_id', doctorProfileId)
      .eq('day_of_week', dayOfWeek)
      .single();

    // If schedule says not working, treat as non-working day (similar to time-off)
    const isNonWorkingDay = scheduleEntry && !scheduleEntry.is_working;

    // Check if this date falls within a time-off period
    const { data: timeOffEntries } = await adminClient
      .from('doctor_time_off')
      .select('start_date, end_date, reason')
      .eq('doctor_profile_id', doctorProfileId)
      .eq('status', 'approved')
      .lte('start_date', date)
      .gte('end_date', date);

    const isTimeOff = (timeOffEntries || []).length > 0;
    const timeOffReason = isTimeOff ? (timeOffEntries![0].reason || 'Day Off') : (isNonWorkingDay ? 'Not Working' : undefined);

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
      // Strip "Dr" prefix to avoid "Dr. Dr" duplication on frontend
      const rawName = profile?.full_name || 'Unknown';
      doctorName = rawName.replace(/^Dr\.?\s+/i, '').trim() || rawName;
    }

    // Get appointments for booked slots
    const slotIds = (slots || []).map((s: any) => s.id);
    const { data: appointments } = await adminClient
      .from('appointments')
      .select('slot_id, id, patient_id, reason_for_visit, status_token')
      .in('slot_id', slotIds.length > 0 ? slotIds : ['00000000-0000-0000-0000-000000000000']);

    const appointmentMap = new Map<string, any>();
    const slotsToFixStatus: string[] = [];
    (appointments || []).forEach((a: any) => {
      appointmentMap.set(a.slot_id, a);
    });

    // Check for data inconsistency: slots with AVAILABLE status but have appointments
    (slots || []).forEach((s: any) => {
      if (s.status === 'AVAILABLE' && appointmentMap.has(s.id)) {
        slotsToFixStatus.push(s.id);
        // Fix the slot object in memory for this response
        s.status = 'BOOKED';
      }
    });

    // Auto-fix inconsistent slot statuses in the database
    if (slotsToFixStatus.length > 0) {
      this.logger.warn(`[getSlotsForDate] Fixing ${slotsToFixStatus.length} slots with inconsistent status`);
      await adminClient
        .from('appointment_slots')
        .update({ status: 'BOOKED' })
        .in('id', slotsToFixStatus);
    }

    // Get patient names and phones for booked appointments
    const patientIds = (appointments || []).map((a: any) => a.patient_id);
    const { data: patients } = await adminClient
      .from('patients')
      .select('id, first_name, last_name, phone')
      .in('id', patientIds.length > 0 ? patientIds : ['00000000-0000-0000-0000-000000000000']);

    const patientMap = new Map<string, { name: string; phone?: string }>();
    (patients || []).forEach((p: any) => {
      patientMap.set(p.id, {
        name: `${p.first_name} ${p.last_name}`,
        phone: p.phone || undefined,
      });
    });

    // Map slots to response DTOs — filter out AVAILABLE slots on time-off days or non-working days
    const filteredSlots = (isTimeOff || isNonWorkingDay)
      ? (slots || []).filter((s: any) => s.status !== 'AVAILABLE')
      : (slots || []);

    const slotResponses: SlotResponseDto[] = filteredSlots.map((s: any) => {
      const appointment = appointmentMap.get(s.id);
      const patient = appointment ? patientMap.get(appointment.patient_id) : undefined;
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
        patientName: patient?.name,
        reasonForVisit: appointment?.reason_for_visit || undefined,
        patientPhone: patient?.phone,
        statusToken: appointment?.status_token || undefined,
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

    // On time-off days, also fetch cancelled appointments so staff can reschedule
    let cancelledAppointments: any[] | undefined;
    if (isTimeOff) {
      const { data: cancelled } = await adminClient
        .from('appointments')
        .select('id, appointment_date, start_time, end_time, status, patient_id')
        .eq('doctor_profile_id', doctorProfileId)
        .eq('hospital_id', hospitalId)
        .eq('appointment_date', date)
        .eq('status', 'CANCELLED')
        .order('start_time');

      if (cancelled && cancelled.length > 0) {
        const cPatientIds = cancelled.map((a: any) => a.patient_id);
        const { data: cPatients } = await adminClient
          .from('patients')
          .select('id, first_name, last_name')
          .in('id', cPatientIds);

        const cPatientMap = new Map<string, string>();
        (cPatients || []).forEach((p: any) => {
          cPatientMap.set(p.id, `${p.first_name} ${p.last_name}`);
        });

        cancelledAppointments = cancelled.map((a: any) => ({
          appointmentId: a.id,
          patientName: cPatientMap.get(a.patient_id) || 'Unknown',
          startTime: a.start_time,
          endTime: a.end_time,
          status: a.status,
        }));
      }
    }

    return {
      date,
      formattedDate,
      morning,
      evening,
      night,
      stats,
      ...(isTimeOff && {
        isTimeOff: true,
        timeOffReason,
        ...(cancelledAppointments && cancelledAppointments.length > 0 && { cancelledAppointments }),
      }),
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

    // Calculate start and end of month (use UTC to avoid timezone offset)
    const startDate = new Date(Date.UTC(year, month - 1, 1)).toISOString().split('T')[0];
    const endDate = new Date(Date.UTC(year, month, 0)).toISOString().split('T')[0];

    // Get doctor's weekly schedule to know which days they work
    const { data: schedules } = await adminClient
      .from('doctor_schedules')
      .select('day_of_week, is_working')
      .eq('doctor_profile_id', doctorProfileId);

    // Build a set of non-working days of the week (0 = Sunday, 6 = Saturday)
    const nonWorkingDays = new Set<number>();
    (schedules || []).forEach((s: any) => {
      if (!s.is_working) {
        nonWorkingDays.add(s.day_of_week);
      }
    });

    // Get time-off entries that overlap this month
    const { data: timeOffs } = await adminClient
      .from('doctor_time_off')
      .select('start_date, end_date')
      .eq('doctor_profile_id', doctorProfileId)
      .eq('status', 'approved')
      .lte('start_date', endDate)
      .gte('end_date', startDate);

    // Build time-off date set for this month
    const timeOffDates = new Set<string>();
    (timeOffs || []).forEach((to: any) => {
      const s = to.start_date < startDate ? startDate : to.start_date;
      const e = to.end_date > endDate ? endDate : to.end_date;
      for (let d = new Date(s + 'T00:00:00Z'); d.toISOString().split('T')[0] <= e; d.setUTCDate(d.getUTCDate() + 1)) {
        timeOffDates.add(d.toISOString().split('T')[0]);
      }
    });

    // Get all slots for the month
    const { data: slots } = await adminClient
      .from('appointment_slots')
      .select('slot_date, status')
      .eq('doctor_profile_id', doctorProfileId)
      .eq('hospital_id', hospitalId)
      .gte('slot_date', startDate)
      .lte('slot_date', endDate);

    // Helper to check if a date is on a non-working day
    const isNonWorkingDay = (dateStr: string): boolean => {
      const d = new Date(dateStr + 'T00:00:00Z');
      return nonWorkingDays.has(d.getUTCDay());
    };

    // Group by date — exclude AVAILABLE slots on time-off days OR non-working days
    const dateMap = new Map<string, { available: number; booked: number }>();
    (slots || []).forEach((s: any) => {
      if (!dateMap.has(s.slot_date)) {
        dateMap.set(s.slot_date, { available: 0, booked: 0 });
      }
      const day = dateMap.get(s.slot_date)!;
      // Don't count AVAILABLE slots on time-off days or non-working days (schedule changed)
      if (s.status === 'AVAILABLE' && !timeOffDates.has(s.slot_date) && !isNonWorkingDay(s.slot_date)) {
        day.available++;
      } else if (s.status === 'BOOKED') {
        day.booked++;
      }
    });

    // Build calendar days
    const calendarDays: CalendarDayDto[] = [];
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

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

    // Double-check: verify no appointment already exists for this slot
    const { data: existingAppointment } = await adminClient
      .from('appointments')
      .select('id, status')
      .eq('slot_id', dto.slotId)
      .maybeSingle();

    if (existingAppointment) {
      // Fix data inconsistency: update slot status to match reality
      await adminClient
        .from('appointment_slots')
        .update({ status: 'BOOKED' })
        .eq('id', dto.slotId);
      throw new BadRequestException('This slot has already been booked. Please select another time.');
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
      this.logger.error(`Failed to create appointment: ${appointmentError.message}`, appointmentError);
      throw new BadRequestException(`Failed to create appointment: ${appointmentError.message}`);
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
      // Strip "Dr" prefix to avoid "Dr. Dr" duplication on frontend
      const rawName = profile?.full_name || 'Unknown';
      doctorName = rawName.replace(/^Dr\.?\s+/i, '').trim() || rawName;
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
      statusToken: appointment.status_token,
      createdAt: appointment.created_at,
    };
  }

  /**
   * Get appointments list, filtered by data scoping context
   */
  async getAppointments(
    query: GetAppointmentsQueryDto,
    hospitalId: string,
    accessToken: string,
    scopingContext?: DataScopingContext | null,
  ): Promise<AppointmentResponseDto[]> {
    const scope = getScopeType(scopingContext, 'appointments');
    if (scope === 'none') return [];

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

    // Apply scoping filter on doctor_profile_id if not full access
    if (scope === 'by_doctor_scope' || scope === 'self_only') {
      const visibleIds = getVisibleDoctorProfileIds(scopingContext);
      if (visibleIds && visibleIds.length > 0) {
        queryBuilder = queryBuilder.in('doctor_profile_id', visibleIds);
      } else if (scopingContext?.doctorProfileId) {
        queryBuilder = queryBuilder.eq('doctor_profile_id', scopingContext.doctorProfileId);
      } else {
        return [];
      }
    }

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
   * Get doctors with appointments license for dropdown, filtered by scoping context
   */
  async getDoctorsWithLicense(
    hospitalId: string,
    userId: string,
    accessToken: string,
    scopingContext?: DataScopingContext | null,
  ): Promise<any[]> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    const scope = getScopeType(scopingContext, 'doctors');
    if (scope === 'none') return [];

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
    (profiles || []).forEach((p: any) => {
      // Strip "Dr" prefix to avoid "Dr. Dr" duplication on frontend
      const rawName = p.full_name || '';
      const cleanName = rawName.replace(/^Dr\.?\s+/i, '').trim() || rawName;
      profileMap.set(p.user_id, cleanName);
    });

    let doctors = (doctorProfiles || []).map((d: any) => ({
      id: d.id,
      userId: d.user_id,
      name: profileMap.get(d.user_id) || 'Unknown',
      specialization: d.specialization,
      appointmentDurationMinutes: d.appointment_duration_minutes || 30,
    }));

    // Apply data scoping filter instead of ad-hoc role check
    const visibleDoctorIds = getVisibleDoctorProfileIds(scopingContext);
    if (visibleDoctorIds) {
      doctors = doctors.filter((d) => visibleDoctorIds.includes(d.id));
    }

    return doctors;
  }

  /**
   * Check for conflicts when schedule/duration/time-off changes
   */
  async checkScheduleConflicts(
    doctorProfileId: string,
    hospitalId: string,
    changeType: 'schedule' | 'duration' | 'timeoff',
    payload: {
      schedules?: { dayOfWeek: number; isWorking: boolean; shiftStart: string | null; shiftEnd: string | null }[];
      durationMinutes?: number;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<{
    conflicts: {
      appointmentId: string;
      patientName: string;
      appointmentDate: string;
      startTime: string;
      endTime: string;
      status: string;
      hasQueueEntry: boolean;
      queueEntryId?: string;
    }[];
    summary: {
      totalAppointments: number;
      totalQueueEntries: number;
      dateRange: { from: string; to: string };
      slotsToDelete: number;
    };
  }> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    const today = await this.getHospitalToday(hospitalId);

    // Get all future booked appointments for this doctor
    const { data: appointments } = await adminClient
      .from('appointments')
      .select('id, appointment_date, start_time, end_time, status, patient_id, slot_id')
      .eq('doctor_profile_id', doctorProfileId)
      .eq('hospital_id', hospitalId)
      .gte('appointment_date', today)
      .in('status', ['SCHEDULED', 'CONFIRMED']);

    if (!appointments || appointments.length === 0) {
      // Count future AVAILABLE slots that would be deleted
      const { count: availableCount } = await adminClient
        .from('appointment_slots')
        .select('id', { count: 'exact', head: true })
        .eq('doctor_profile_id', doctorProfileId)
        .eq('hospital_id', hospitalId)
        .gte('slot_date', today)
        .eq('status', 'AVAILABLE');

      return {
        conflicts: [],
        summary: {
          totalAppointments: 0,
          totalQueueEntries: 0,
          dateRange: { from: today, to: today },
          slotsToDelete: availableCount || 0,
        },
      };
    }

    // Get patient names
    const patientIds = [...new Set(appointments.map((a: any) => a.patient_id))];
    const { data: patients } = await adminClient
      .from('patients')
      .select('id, first_name, last_name')
      .in('id', patientIds);

    const patientMap = new Map<string, string>();
    (patients || []).forEach((p: any) => {
      patientMap.set(p.id, `${p.first_name} ${p.last_name}`.trim());
    });

    // Get queue entries for those appointments
    const appointmentIds = appointments.map((a: any) => a.id);
    const { data: queueEntries } = await adminClient
      .from('queue_entries')
      .select('id, appointment_id, status')
      .in('appointment_id', appointmentIds)
      .in('status', ['QUEUED', 'WAITING']);

    const queueMap = new Map<string, string>();
    (queueEntries || []).forEach((q: any) => {
      queueMap.set(q.appointment_id, q.id);
    });

    // Determine which appointments are conflicts based on change type
    const conflicts: any[] = [];

    for (const appt of appointments as any[]) {
      let isConflict = false;

      if (changeType === 'schedule' && payload.schedules) {
        const apptDate = new Date(appt.appointment_date + 'T00:00:00Z');
        const dayOfWeek = apptDate.getUTCDay();
        const proposed = payload.schedules.find(s => s.dayOfWeek === dayOfWeek);

        if (!proposed || !proposed.isWorking) {
          // Day is no longer a working day
          isConflict = true;
        } else if (proposed.shiftStart && proposed.shiftEnd) {
          // Check if appointment time falls outside new shift window
          const apptStart = this.timeToMinutes(appt.start_time);
          const apptEnd = this.timeToMinutes(appt.end_time);
          const shiftStart = this.timeToMinutes(proposed.shiftStart);
          const shiftEnd = this.timeToMinutes(proposed.shiftEnd);
          if (apptStart < shiftStart || apptEnd > shiftEnd) {
            isConflict = true;
          }
        }
      } else if (changeType === 'duration') {
        // Duration change affects all slot boundaries
        isConflict = true;
      } else if (changeType === 'timeoff' && payload.startDate && payload.endDate) {
        // Check if appointment date falls within time-off range
        if (appt.appointment_date >= payload.startDate && appt.appointment_date <= payload.endDate) {
          isConflict = true;
        }
      }

      if (isConflict) {
        const queueEntryId = queueMap.get(appt.id);
        conflicts.push({
          appointmentId: appt.id,
          patientName: patientMap.get(appt.patient_id) || 'Unknown',
          appointmentDate: appt.appointment_date,
          startTime: appt.start_time,
          endTime: appt.end_time,
          status: appt.status,
          hasQueueEntry: !!queueEntryId,
          queueEntryId: queueEntryId || undefined,
        });
      }
    }

    // Count future AVAILABLE slots
    const { count: availableCount } = await adminClient
      .from('appointment_slots')
      .select('id', { count: 'exact', head: true })
      .eq('doctor_profile_id', doctorProfileId)
      .eq('hospital_id', hospitalId)
      .gte('slot_date', today)
      .eq('status', 'AVAILABLE');

    const dates = conflicts.map(c => c.appointmentDate).sort();

    return {
      conflicts,
      summary: {
        totalAppointments: conflicts.length,
        totalQueueEntries: conflicts.filter(c => c.hasQueueEntry).length,
        dateRange: {
          from: dates[0] || today,
          to: dates[dates.length - 1] || today,
        },
        slotsToDelete: availableCount || 0,
      },
    };
  }

  /**
   * Regenerate slots: cancel conflicting appointments, delete future AVAILABLE slots, regenerate
   */
  async regenerateSlots(
    doctorProfileId: string,
    hospitalId: string,
    userId: string,
    accessToken: string,
    cancelAppointmentIds: string[],
  ): Promise<{ cancelled: number; slotsDeleted: number; slotsGenerated: number }> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    const today = await this.getHospitalToday(hospitalId);
    this.logger.log(`[regenerateSlots] Starting for doctor ${doctorProfileId}, hospital ${hospitalId}, today=${today}, cancelling ${cancelAppointmentIds.length} appointments`);
    let cancelledCount = 0;

    // 1. Cancel conflicting appointments
    for (const appointmentId of cancelAppointmentIds) {
      const { data: appt } = await adminClient
        .from('appointments')
        .select('id, slot_id, status')
        .eq('id', appointmentId)
        .eq('hospital_id', hospitalId)
        .single();

      if (!appt || appt.status === 'CANCELLED') continue;

      // Cancel the appointment
      await adminClient
        .from('appointments')
        .update({
          status: 'CANCELLED',
          cancellation_reason: 'Schedule change by hospital',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', appointmentId);

      // Set slot back to AVAILABLE
      if (appt.slot_id) {
        await adminClient
          .from('appointment_slots')
          .update({ status: 'AVAILABLE' })
          .eq('id', appt.slot_id);
      }

      // Remove linked queue entries
      await adminClient
        .from('queue_entries')
        .update({ status: 'LEFT' })
        .eq('appointment_id', appointmentId)
        .in('status', ['QUEUED', 'WAITING']);

      cancelledCount++;
    }

    // 2. Delete all future AVAILABLE slots that have no appointments linked
    // First, get slot IDs that have appointments (to exclude them)
    const { data: slotsWithAppointments } = await adminClient
      .from('appointments')
      .select('slot_id')
      .eq('doctor_profile_id', doctorProfileId)
      .gte('appointment_date', today)
      .not('slot_id', 'is', null);

    const slotsWithAppointmentIds = new Set(
      (slotsWithAppointments || []).map((a: any) => a.slot_id).filter(Boolean)
    );

    // Get AVAILABLE slots that can be safely deleted
    const { data: availableSlots } = await adminClient
      .from('appointment_slots')
      .select('id')
      .eq('doctor_profile_id', doctorProfileId)
      .eq('hospital_id', hospitalId)
      .gte('slot_date', today)
      .eq('status', 'AVAILABLE');

    const slotIdsToDelete = (availableSlots || [])
      .map((s: any) => s.id)
      .filter((id: string) => !slotsWithAppointmentIds.has(id));

    let deletedCount = 0;
    if (slotIdsToDelete.length > 0) {
      const { count, error: deleteError } = await adminClient
        .from('appointment_slots')
        .delete({ count: 'exact' })
        .in('id', slotIdsToDelete);

      if (deleteError) {
        this.logger.error(`[regenerateSlots] Delete error: ${deleteError.message}`);
      } else {
        deletedCount = count || 0;
      }
    }
    this.logger.log(`[regenerateSlots] Deleted ${deletedCount} AVAILABLE slots from ${today} onward (${slotsWithAppointmentIds.size} slots had appointments)`);

    // 3. Regenerate slots for 3 months from today
    const todayDate = new Date(today + 'T00:00:00Z');
    todayDate.setUTCMonth(todayDate.getUTCMonth() + 3);
    const endDateStr = todayDate.toISOString().split('T')[0];

    const result = await this.generateSlots(
      {
        doctorProfileId,
        startDate: today,
        endDate: endDateStr,
      },
      hospitalId,
      userId,
      accessToken,
    );

    this.logger.log(`[regenerateSlots] Done: cancelled=${cancelledCount}, deleted=${deletedCount || 0}, generated=${result.slotsGenerated}, skipped=${result.slotsSkipped}`);

    return {
      cancelled: cancelledCount,
      slotsDeleted: deletedCount || 0,
      slotsGenerated: result.slotsGenerated,
    };
  }

  /**
   * Get the latest slot date for a doctor
   */
  async getLatestSlotDate(doctorProfileId: string, hospitalId: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }
    const { data } = await adminClient
      .from('appointment_slots')
      .select('slot_date')
      .eq('doctor_profile_id', doctorProfileId)
      .eq('hospital_id', hospitalId)
      .order('slot_date', { ascending: false })
      .limit(1)
      .single();
    return { latestSlotDate: data?.slot_date || null };
  }

  /**
   * Get active appointment reasons (for dropdowns)
   */
  async getAppointmentReasons(): Promise<{ id: string; name: string; description: string | null }[]> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    const { data, error } = await adminClient
      .from('appointment_reasons')
      .select('id, name, description')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      this.logger.error(`Failed to fetch appointment reasons: ${error.message}`);
      return [];
    }

    return data || [];
  }

  // ============ Public (Token-Based) Methods ============

  /**
   * Get appointment status by public token (no auth required)
   */
  async getAppointmentStatusByToken(token: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    const { data: appointment, error } = await adminClient
      .from('appointments')
      .select('*')
      .eq('status_token', token)
      .single();

    if (error || !appointment) {
      throw new NotFoundException('Appointment not found');
    }

    // Get patient info
    const { data: patient } = await adminClient
      .from('patients')
      .select('first_name, last_name, phone')
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
      // Strip "Dr" prefix to avoid "Dr. Dr" duplication on frontend
      const rawName = profile?.full_name || 'Unknown';
      doctorName = rawName.replace(/^Dr\.?\s+/i, '').trim() || rawName;
    }

    // Get hospital info
    const { data: hospital } = await adminClient
      .from('hospitals')
      .select('name, logo_url')
      .eq('id', appointment.hospital_id)
      .single();

    const canModify = ['SCHEDULED', 'CONFIRMED'].includes(appointment.status);

    return {
      id: appointment.id,
      patientName: patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown',
      doctorName,
      doctorSpecialization: doctorProfile?.specialization || null,
      hospitalName: hospital?.name || 'Unknown',
      hospitalLogoUrl: hospital?.logo_url || null,
      appointmentDate: appointment.appointment_date,
      startTime: appointment.start_time,
      endTime: appointment.end_time,
      status: appointment.status,
      reasonForVisit: appointment.reason_for_visit,
      cancellationReason: appointment.cancellation_reason,
      bookedAt: appointment.booked_at,
      cancelledAt: appointment.cancelled_at,
      completedAt: appointment.completed_at,
      canCancel: canModify,
      canReschedule: canModify,
    };
  }

  /**
   * Cancel appointment by public token (no auth required)
   */
  async cancelAppointmentByToken(token: string, reason?: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    const { data: appointment, error } = await adminClient
      .from('appointments')
      .select('id, status, slot_id, hospital_id')
      .eq('status_token', token)
      .single();

    if (error || !appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (!['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) {
      throw new BadRequestException('This appointment cannot be cancelled');
    }

    // Cancel the appointment
    const { error: updateError } = await adminClient
      .from('appointments')
      .update({
        status: 'CANCELLED',
        cancellation_reason: reason || 'Cancelled by patient',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', appointment.id);

    if (updateError) {
      throw new BadRequestException('Failed to cancel appointment');
    }

    // Release the slot
    if (appointment.slot_id) {
      await adminClient
        .from('appointment_slots')
        .update({ status: 'AVAILABLE' })
        .eq('id', appointment.slot_id);
    }

    return { success: true, message: 'Appointment cancelled successfully' };
  }

  /**
   * Get available slots for reschedule by public token (no auth required)
   */
  async getAvailableSlotsForReschedule(token: string, date: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    const { data: appointment, error } = await adminClient
      .from('appointments')
      .select('id, doctor_profile_id, hospital_id, status')
      .eq('status_token', token)
      .single();

    if (error || !appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (!['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) {
      throw new BadRequestException('This appointment cannot be rescheduled');
    }

    // Get available slots for this doctor on the requested date
    const { data: slots, error: slotsError } = await adminClient
      .from('appointment_slots')
      .select('id, slot_date, start_time, end_time, duration_minutes, period, status')
      .eq('doctor_profile_id', appointment.doctor_profile_id)
      .eq('hospital_id', appointment.hospital_id)
      .eq('slot_date', date)
      .eq('status', 'AVAILABLE')
      .order('start_time');

    if (slotsError) {
      throw new BadRequestException('Failed to fetch available slots');
    }

    // Group by period
    const morning = (slots || []).filter((s: any) => s.period === 'MORNING');
    const evening = (slots || []).filter((s: any) => s.period === 'EVENING');
    const night = (slots || []).filter((s: any) => s.period === 'NIGHT');

    return {
      date,
      doctorProfileId: appointment.doctor_profile_id,
      morning: morning.map((s: any) => ({
        id: s.id,
        startTime: s.start_time,
        endTime: s.end_time,
        durationMinutes: s.duration_minutes,
      })),
      evening: evening.map((s: any) => ({
        id: s.id,
        startTime: s.start_time,
        endTime: s.end_time,
        durationMinutes: s.duration_minutes,
      })),
      night: night.map((s: any) => ({
        id: s.id,
        startTime: s.start_time,
        endTime: s.end_time,
        durationMinutes: s.duration_minutes,
      })),
    };
  }

  /**
   * Reschedule appointment by public token (no auth required)
   * Cancels old appointment and creates new one on the selected slot
   */
  async rescheduleAppointmentByToken(token: string, newSlotId: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    // Get old appointment
    const { data: oldAppointment, error } = await adminClient
      .from('appointments')
      .select('*')
      .eq('status_token', token)
      .single();

    if (error || !oldAppointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (!['SCHEDULED', 'CONFIRMED'].includes(oldAppointment.status)) {
      throw new BadRequestException('This appointment cannot be rescheduled');
    }

    // Get the new slot
    const { data: newSlot, error: slotError } = await adminClient
      .from('appointment_slots')
      .select('*')
      .eq('id', newSlotId)
      .eq('doctor_profile_id', oldAppointment.doctor_profile_id)
      .eq('hospital_id', oldAppointment.hospital_id)
      .single();

    if (slotError || !newSlot) {
      throw new NotFoundException('Selected slot not found');
    }

    if (newSlot.status !== 'AVAILABLE') {
      throw new BadRequestException('Selected slot is no longer available');
    }

    // Cancel old appointment
    await adminClient
      .from('appointments')
      .update({
        status: 'CANCELLED',
        cancellation_reason: 'Rescheduled by patient',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', oldAppointment.id);

    // Release old slot
    if (oldAppointment.slot_id) {
      await adminClient
        .from('appointment_slots')
        .update({ status: 'AVAILABLE' })
        .eq('id', oldAppointment.slot_id);
    }

    // Create new appointment
    const { data: newAppointment, error: createError } = await adminClient
      .from('appointments')
      .insert({
        hospital_id: oldAppointment.hospital_id,
        slot_id: newSlotId,
        patient_id: oldAppointment.patient_id,
        doctor_profile_id: oldAppointment.doctor_profile_id,
        appointment_date: newSlot.slot_date,
        start_time: newSlot.start_time,
        end_time: newSlot.end_time,
        status: 'SCHEDULED',
        reason_for_visit: oldAppointment.reason_for_visit,
        notes: oldAppointment.notes,
        booked_by_user_id: oldAppointment.booked_by_user_id,
      })
      .select('id, status_token')
      .single();

    if (createError || !newAppointment) {
      // Rollback: re-activate old appointment
      await adminClient
        .from('appointments')
        .update({
          status: oldAppointment.status,
          cancellation_reason: null,
          cancelled_at: null,
        })
        .eq('id', oldAppointment.id);

      if (oldAppointment.slot_id) {
        await adminClient
          .from('appointment_slots')
          .update({ status: 'BOOKED' })
          .eq('id', oldAppointment.slot_id);
      }

      throw new BadRequestException('Failed to create new appointment. Original appointment restored.');
    }

    // Mark new slot as BOOKED
    await adminClient
      .from('appointment_slots')
      .update({ status: 'BOOKED' })
      .eq('id', newSlotId);

    return {
      success: true,
      message: 'Appointment rescheduled successfully',
      newToken: newAppointment.status_token,
      newAppointmentId: newAppointment.id,
    };
  }

  // ============ Private Helper Methods ============

  /**
   * Get today's date in the hospital's local timezone (YYYY-MM-DD).
   */
  private async getHospitalToday(hospitalId: string): Promise<string> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) return new Date().toISOString().split('T')[0];
    const { data } = await adminClient
      .from('hospitals')
      .select('timezone')
      .eq('id', hospitalId)
      .single();
    const tz = data?.timezone || 'UTC';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

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
    shiftTimingConfig?: any,
  ): any[] {
    const slots: any[] = [];

    const startMinutes = this.timeToMinutes(shiftStart);
    const endMinutes = this.timeToMinutes(shiftEnd);

    let currentMinutes = startMinutes;

    while (currentMinutes + durationMinutes <= endMinutes) {
      const startTime = this.minutesToTime(currentMinutes);
      const endTime = this.minutesToTime(currentMinutes + durationMinutes);
      const period = this.getPeriodFromTime(startTime, shiftTimingConfig);

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

  private getPeriodFromTime(time: string, shiftTimingConfig?: any): string {
    if (shiftTimingConfig) {
      const timeMinutes = this.timeToMinutes(time);
      const morningEnd = this.timeToMinutes(shiftTimingConfig.morning?.end || '14:00');
      const eveningEnd = this.timeToMinutes(shiftTimingConfig.evening?.end || '22:00');
      const morningStart = this.timeToMinutes(shiftTimingConfig.morning?.start || '06:00');

      if (timeMinutes >= morningStart && timeMinutes < morningEnd) return 'MORNING';
      if (timeMinutes >= morningEnd && timeMinutes < eveningEnd) return 'EVENING';
      return 'NIGHT';
    }

    const hour = parseInt(time.split(':')[0], 10);
    if (hour >= 6 && hour < 14) return 'MORNING';
    if (hour >= 14 && hour < 22) return 'EVENING';
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
      // Strip "Dr" prefix to avoid "Dr. Dr" duplication on frontend
      const rawName = profile?.full_name || 'Unknown';
      doctorName = rawName.replace(/^Dr\.?\s+/i, '').trim() || rawName;
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
