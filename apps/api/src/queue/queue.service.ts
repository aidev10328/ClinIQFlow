import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  AddWalkInDto,
  UpdateQueueStatusDto,
  UpdateQueuePriorityDto,
  QueueEntryDto,
  QueueEntryStatus,
  QueueEntryType,
  QueuePriority,
  DoctorDailyStatus,
  DailyQueueResponseDto,
  PublicQueueStatusDto,
} from './dto/queue.dto';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(private supabaseService: SupabaseService) {}

  private getAdminClientOrThrow() {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }
    return adminClient;
  }

  /**
   * Get today's date in the hospital's local timezone (YYYY-MM-DD).
   */
  private async getHospitalToday(hospitalId: string): Promise<string> {
    const adminClient = this.getAdminClientOrThrow();
    const { data } = await adminClient
      .from('hospitals')
      .select('timezone')
      .eq('id', hospitalId)
      .single();

    const tz = data?.timezone || 'UTC';
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    return formatter.format(now); // en-CA locale returns YYYY-MM-DD
  }

  /**
   * Get daily queue for a doctor
   */
  async getDailyQueue(
    hospitalId: string,
    doctorProfileId: string,
    date: string,
  ): Promise<DailyQueueResponseDto> {
    const adminClient = this.getAdminClientOrThrow();
    if (!date) date = await this.getHospitalToday(hospitalId);

    // Get hospital holidays
    const { data: hospitalData } = await adminClient
      .from('hospitals')
      .select('hospital_holidays')
      .eq('id', hospitalId)
      .single();

    const hospitalHolidays: { month: number; day: number; name: string }[] = hospitalData?.hospital_holidays || [];
    const dateObj = new Date(date + 'T00:00:00');
    const dateMonth = dateObj.getMonth() + 1;
    const dateDay = dateObj.getDate();
    const matchingHoliday = hospitalHolidays.find(h => h.month === dateMonth && h.day === dateDay);

    // Get doctor check-in status
    const { data: doctorCheckin } = await adminClient
      .from('doctor_daily_checkins')
      .select('*')
      .eq('doctor_profile_id', doctorProfileId)
      .eq('checkin_date', date)
      .single();

    // Get all queue entries for the day
    const { data: queueEntries, error: queueError } = await adminClient
      .from('queue_entries')
      .select(`
        *,
        patients (id, first_name, last_name, phone)
      `)
      .eq('doctor_profile_id', doctorProfileId)
      .eq('queue_date', date)
      .order('queue_number', { ascending: true });

    if (queueError) {
      this.logger.error('Error fetching queue entries:', queueError);
      throw new BadRequestException('Failed to fetch queue');
    }

    // Get scheduled appointments for the day that haven't been checked in yet
    const { data: scheduledAppointments } = await adminClient
      .from('appointments')
      .select(`
        id,
        slot_id,
        patient_id,
        start_time,
        end_time,
        status,
        status_token,
        reason_for_visit,
        patients (id, first_name, last_name, phone)
      `)
      .eq('doctor_profile_id', doctorProfileId)
      .eq('appointment_date', date)
      .in('status', ['SCHEDULED', 'CONFIRMED']);

    // Check which appointments are already in the queue
    const checkedInAppointmentIds = new Set(
      (queueEntries || [])
        .filter((e: any) => e.appointment_id)
        .map((e: any) => e.appointment_id)
    );

    // Map queue entries to DTOs
    const mapEntry = (entry: any): QueueEntryDto => ({
      id: entry.id,
      hospitalId: entry.hospital_id,
      doctorProfileId: entry.doctor_profile_id,
      patientId: entry.patient_id,
      appointmentId: entry.appointment_id,
      queueDate: entry.queue_date,
      queueNumber: entry.queue_number,
      entryType: entry.entry_type,
      status: entry.status,
      priority: entry.priority,
      walkInName: entry.walk_in_name,
      walkInPhone: entry.walk_in_phone,
      reasonForVisit: entry.reason_for_visit,
      checkedInAt: entry.checked_in_at,
      calledAt: entry.called_at,
      withDoctorAt: entry.with_doctor_at,
      completedAt: entry.completed_at,
      notes: entry.notes,
      waitTimeMinutes: entry.wait_time_minutes,
      consultationTimeMinutes: entry.consultation_time_minutes,
      statusToken: entry.status_token,
      patient: entry.patients ? {
        id: entry.patients.id,
        firstName: entry.patients.first_name,
        lastName: entry.patients.last_name,
        phone: entry.patients.phone,
      } : undefined,
    });

    const allEntries = (queueEntries || []).map(mapEntry);

    // Separate by status
    const queue = allEntries.filter(e => e.status === QueueEntryStatus.QUEUED);
    const waiting = allEntries.filter(e => e.status === QueueEntryStatus.WAITING);
    const withDoctor = allEntries.find(e => e.status === QueueEntryStatus.WITH_DOCTOR) || null;
    const completed = allEntries.filter(e =>
      e.status === QueueEntryStatus.COMPLETED ||
      e.status === QueueEntryStatus.NO_SHOW ||
      e.status === QueueEntryStatus.LEFT
    );

    // Map scheduled appointments
    const scheduled = (scheduledAppointments || []).map((appt: any) => ({
      id: appt.id,
      appointmentId: appt.id,
      startTime: appt.start_time,
      endTime: appt.end_time,
      patientId: appt.patient_id,
      patientName: appt.patients ? `${appt.patients.first_name} ${appt.patients.last_name}` : 'Unknown',
      patientPhone: appt.patients?.phone || null,
      reasonForVisit: appt.reason_for_visit || null,
      status: appt.status,
      statusToken: appt.status_token || null,
      isCheckedIn: checkedInAppointmentIds.has(appt.id),
    }));

    return {
      date,
      doctorCheckin: doctorCheckin ? {
        id: doctorCheckin.id,
        hospitalId: doctorCheckin.hospital_id,
        doctorProfileId: doctorCheckin.doctor_profile_id,
        checkinDate: doctorCheckin.checkin_date,
        status: doctorCheckin.status,
        checkedInAt: doctorCheckin.checked_in_at,
        checkedOutAt: doctorCheckin.checked_out_at,
      } : null,
      queue,
      waiting,
      withDoctor,
      completed,
      scheduled,
      stats: {
        totalQueue: queue.length,
        totalWaiting: waiting.length,
        totalScheduled: scheduled.filter((s: any) => !s.isCheckedIn).length,
        totalCompleted: completed.length,
      },
      isHospitalHoliday: !!matchingHoliday,
      holidayName: matchingHoliday?.name,
    };
  }

  /**
   * Add walk-in patient to queue
   */
  async addWalkIn(
    hospitalId: string,
    dto: AddWalkInDto,
    userId: string,
  ): Promise<QueueEntryDto> {
    const adminClient = this.getAdminClientOrThrow();

    // Get current date in hospital's local timezone
    const today = await this.getHospitalToday(hospitalId);

    // Get next queue number
    const { data: maxQueue } = await adminClient
      .from('queue_entries')
      .select('queue_number')
      .eq('doctor_profile_id', dto.doctorProfileId)
      .eq('queue_date', today)
      .order('queue_number', { ascending: false })
      .limit(1)
      .single();

    const nextQueueNumber = (maxQueue?.queue_number || 0) + 1;

    // Insert queue entry
    const { data: entry, error } = await adminClient
      .from('queue_entries')
      .insert({
        hospital_id: hospitalId,
        doctor_profile_id: dto.doctorProfileId,
        patient_id: dto.patientId || null,
        queue_date: today,
        queue_number: nextQueueNumber,
        entry_type: QueueEntryType.WALK_IN,
        status: QueueEntryStatus.QUEUED,
        priority: dto.priority || QueuePriority.NORMAL,
        walk_in_name: dto.walkInName || null,
        walk_in_phone: dto.walkInPhone || null,
        reason_for_visit: dto.reasonForVisit || null,
        checked_in_at: new Date().toISOString(),
        created_by: userId,
      })
      .select(`
        *,
        patients (id, first_name, last_name, phone)
      `)
      .single();

    if (error) {
      this.logger.error('Error adding walk-in:', error);
      throw new BadRequestException('Failed to add walk-in patient');
    }

    this.logger.log(`Added walk-in #${nextQueueNumber} for doctor ${dto.doctorProfileId}`);

    return this.mapQueueEntry(entry);
  }

  /**
   * Check in scheduled appointment
   */
  async checkInAppointment(
    hospitalId: string,
    appointmentId: string,
    userId: string,
  ): Promise<QueueEntryDto> {
    const adminClient = this.getAdminClientOrThrow();

    // Get appointment details
    const { data: appointment, error: apptError } = await adminClient
      .from('appointments')
      .select('*, patients (id, first_name, last_name, phone)')
      .eq('id', appointmentId)
      .eq('hospital_id', hospitalId)
      .single();

    if (apptError || !appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (!['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) {
      throw new BadRequestException('Appointment cannot be checked in');
    }

    const today = await this.getHospitalToday(hospitalId);

    // Check if already in queue
    const { data: existing } = await adminClient
      .from('queue_entries')
      .select('id')
      .eq('appointment_id', appointmentId)
      .eq('queue_date', today)
      .single();

    if (existing) {
      throw new BadRequestException('Appointment already checked in');
    }

    // Get next queue number
    const { data: maxQueue } = await adminClient
      .from('queue_entries')
      .select('queue_number')
      .eq('doctor_profile_id', appointment.doctor_profile_id)
      .eq('queue_date', today)
      .order('queue_number', { ascending: false })
      .limit(1)
      .single();

    const nextQueueNumber = (maxQueue?.queue_number || 0) + 1;

    // Insert queue entry
    const { data: entry, error } = await adminClient
      .from('queue_entries')
      .insert({
        hospital_id: hospitalId,
        doctor_profile_id: appointment.doctor_profile_id,
        patient_id: appointment.patient_id,
        appointment_id: appointmentId,
        queue_date: today,
        queue_number: nextQueueNumber,
        entry_type: QueueEntryType.SCHEDULED,
        status: QueueEntryStatus.QUEUED,
        priority: QueuePriority.NORMAL,
        reason_for_visit: appointment.reason_for_visit || null,
        checked_in_at: new Date().toISOString(),
        created_by: userId,
      })
      .select(`
        *,
        patients (id, first_name, last_name, phone)
      `)
      .single();

    if (error) {
      this.logger.error('Error checking in appointment:', error);
      throw new BadRequestException('Failed to check in appointment');
    }

    // Update appointment status
    await adminClient
      .from('appointments')
      .update({ status: 'CONFIRMED' })
      .eq('id', appointmentId);

    this.logger.log(`Checked in appointment ${appointmentId} as #${nextQueueNumber}`);

    return this.mapQueueEntry(entry);
  }

  /**
   * Mark scheduled appointment as no-show (without checking in first)
   */
  async markAppointmentNoShow(
    hospitalId: string,
    appointmentId: string,
    userId: string,
  ): Promise<QueueEntryDto> {
    const adminClient = this.getAdminClientOrThrow();

    // Get appointment details
    const { data: appointment, error: apptError } = await adminClient
      .from('appointments')
      .select('*, patients (id, first_name, last_name, phone)')
      .eq('id', appointmentId)
      .eq('hospital_id', hospitalId)
      .single();

    if (apptError || !appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (!['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) {
      throw new BadRequestException('Appointment cannot be marked as no-show');
    }

    const today = await this.getHospitalToday(hospitalId);

    // Check if already in queue
    const { data: existing } = await adminClient
      .from('queue_entries')
      .select('id')
      .eq('appointment_id', appointmentId)
      .eq('queue_date', today)
      .single();

    if (existing) {
      throw new BadRequestException('Appointment already processed');
    }

    // Get next queue number
    const { data: maxQueue } = await adminClient
      .from('queue_entries')
      .select('queue_number')
      .eq('doctor_profile_id', appointment.doctor_profile_id)
      .eq('queue_date', today)
      .order('queue_number', { ascending: false })
      .limit(1)
      .single();

    const nextQueueNumber = (maxQueue?.queue_number || 0) + 1;
    const now = new Date().toISOString();

    // Insert queue entry with NO_SHOW status
    const { data: entry, error } = await adminClient
      .from('queue_entries')
      .insert({
        hospital_id: hospitalId,
        doctor_profile_id: appointment.doctor_profile_id,
        patient_id: appointment.patient_id,
        appointment_id: appointmentId,
        queue_date: today,
        queue_number: nextQueueNumber,
        entry_type: QueueEntryType.SCHEDULED,
        status: QueueEntryStatus.NO_SHOW,
        priority: QueuePriority.NORMAL,
        reason_for_visit: appointment.reason_for_visit || null,
        checked_in_at: now,
        completed_at: now,
        created_by: userId,
      })
      .select(`
        *,
        patients (id, first_name, last_name, phone)
      `)
      .single();

    if (error) {
      this.logger.error('Error marking appointment as no-show:', error);
      throw new BadRequestException('Failed to mark appointment as no-show');
    }

    // Update appointment status
    await adminClient
      .from('appointments')
      .update({ status: 'NO_SHOW' })
      .eq('id', appointmentId);

    this.logger.log(`Marked appointment ${appointmentId} as no-show`);

    return this.mapQueueEntry(entry);
  }

  /**
   * Update queue entry status
   */
  async updateQueueStatus(
    hospitalId: string,
    entryId: string,
    dto: UpdateQueueStatusDto,
  ): Promise<QueueEntryDto> {
    const adminClient = this.getAdminClientOrThrow();

    const updates: any = {
      status: dto.status,
    };

    // Set timestamps based on status
    const now = new Date().toISOString();
    if (dto.status === QueueEntryStatus.WAITING) {
      updates.called_at = now;
    } else if (dto.status === QueueEntryStatus.WITH_DOCTOR) {
      updates.with_doctor_at = now;
    } else if ([QueueEntryStatus.COMPLETED, QueueEntryStatus.NO_SHOW, QueueEntryStatus.LEFT].includes(dto.status)) {
      updates.completed_at = now;
    }

    if (dto.notes) {
      updates.notes = dto.notes;
    }

    const { data: entry, error } = await adminClient
      .from('queue_entries')
      .update(updates)
      .eq('id', entryId)
      .eq('hospital_id', hospitalId)
      .select(`
        *,
        patients (id, first_name, last_name, phone)
      `)
      .single();

    if (error) {
      this.logger.error('Error updating queue status:', error);
      throw new BadRequestException('Failed to update queue status');
    }

    // If completed, also update the appointment status
    if (dto.status === QueueEntryStatus.COMPLETED && entry.appointment_id) {
      await adminClient
        .from('appointments')
        .update({ status: 'COMPLETED' })
        .eq('id', entry.appointment_id);
    }

    // Calculate wait time and consultation time if completed
    if (dto.status === QueueEntryStatus.COMPLETED) {
      const checkedInAt = new Date(entry.checked_in_at);
      const withDoctorAt = entry.with_doctor_at ? new Date(entry.with_doctor_at) : null;
      const completedAt = new Date(now);

      const waitTimeMinutes = withDoctorAt
        ? Math.round((withDoctorAt.getTime() - checkedInAt.getTime()) / 60000)
        : null;
      const consultationTimeMinutes = withDoctorAt
        ? Math.round((completedAt.getTime() - withDoctorAt.getTime()) / 60000)
        : null;

      await adminClient
        .from('queue_entries')
        .update({
          wait_time_minutes: waitTimeMinutes,
          consultation_time_minutes: consultationTimeMinutes,
        })
        .eq('id', entryId);
    }

    this.logger.log(`Updated queue entry ${entryId} status to ${dto.status}`);

    return this.mapQueueEntry(entry);
  }

  /**
   * Move queue entry to top of queue
   */
  async moveToTop(
    hospitalId: string,
    entryId: string,
  ): Promise<QueueEntryDto> {
    const adminClient = this.getAdminClientOrThrow();

    // Get the entry to move
    const { data: entryToMove, error: entryError } = await adminClient
      .from('queue_entries')
      .select('*')
      .eq('id', entryId)
      .eq('hospital_id', hospitalId)
      .single();

    if (entryError || !entryToMove) {
      throw new NotFoundException('Queue entry not found');
    }

    // Only move entries that are in QUEUED status
    if (entryToMove.status !== QueueEntryStatus.QUEUED) {
      throw new BadRequestException('Can only move queued entries');
    }

    // Get all QUEUED entries for this doctor/date with lower queue numbers
    const { data: entriesBelow } = await adminClient
      .from('queue_entries')
      .select('id, queue_number')
      .eq('doctor_profile_id', entryToMove.doctor_profile_id)
      .eq('queue_date', entryToMove.queue_date)
      .eq('status', QueueEntryStatus.QUEUED)
      .lt('queue_number', entryToMove.queue_number)
      .order('queue_number', { ascending: true });

    if (!entriesBelow || entriesBelow.length === 0) {
      // Already at top
      return this.mapQueueEntry(entryToMove);
    }

    // Get the minimum queue number
    const minQueueNumber = entriesBelow[0].queue_number;

    // Shift all entries below up by 1
    for (const entry of entriesBelow) {
      await adminClient
        .from('queue_entries')
        .update({ queue_number: entry.queue_number + 1 })
        .eq('id', entry.id);
    }

    // Set the moved entry to the minimum queue number
    const { data: updatedEntry, error: updateError } = await adminClient
      .from('queue_entries')
      .update({ queue_number: minQueueNumber, priority: QueuePriority.URGENT })
      .eq('id', entryId)
      .select(`
        *,
        patients (id, first_name, last_name, phone)
      `)
      .single();

    if (updateError) {
      this.logger.error('Error moving entry to top:', updateError);
      throw new BadRequestException('Failed to move entry to top');
    }

    this.logger.log(`Moved queue entry ${entryId} to top`);

    return this.mapQueueEntry(updatedEntry);
  }

  /**
   * Update queue entry priority
   */
  async updateQueuePriority(
    hospitalId: string,
    entryId: string,
    dto: UpdateQueuePriorityDto,
  ): Promise<QueueEntryDto> {
    const adminClient = this.getAdminClientOrThrow();

    const { data: entry, error } = await adminClient
      .from('queue_entries')
      .update({ priority: dto.priority })
      .eq('id', entryId)
      .eq('hospital_id', hospitalId)
      .select(`
        *,
        patients (id, first_name, last_name, phone)
      `)
      .single();

    if (error) {
      this.logger.error('Error updating queue priority:', error);
      throw new BadRequestException('Failed to update queue priority');
    }

    this.logger.log(`Updated queue entry ${entryId} priority to ${dto.priority}`);

    return this.mapQueueEntry(entry);
  }

  /**
   * Doctor check-in
   */
  async doctorCheckIn(
    hospitalId: string,
    doctorProfileId: string,
    userId: string,
  ): Promise<any> {
    const adminClient = this.getAdminClientOrThrow();
    const today = await this.getHospitalToday(hospitalId);

    // Upsert doctor check-in
    const { data, error } = await adminClient
      .from('doctor_daily_checkins')
      .upsert({
        hospital_id: hospitalId,
        doctor_profile_id: doctorProfileId,
        checkin_date: today,
        status: DoctorDailyStatus.CHECKED_IN,
        checked_in_at: new Date().toISOString(),
      }, {
        onConflict: 'doctor_profile_id,checkin_date',
      })
      .select()
      .single();

    if (error) {
      this.logger.error('Error doctor check-in:', error);
      throw new BadRequestException('Failed to check in doctor');
    }

    this.logger.log(`Doctor ${doctorProfileId} checked in`);

    return data;
  }

  /**
   * Doctor check-out
   */
  async doctorCheckOut(
    hospitalId: string,
    doctorProfileId: string,
  ): Promise<any> {
    const adminClient = this.getAdminClientOrThrow();
    const today = await this.getHospitalToday(hospitalId);

    const { data, error } = await adminClient
      .from('doctor_daily_checkins')
      .update({
        status: DoctorDailyStatus.CHECKED_OUT,
        checked_out_at: new Date().toISOString(),
      })
      .eq('doctor_profile_id', doctorProfileId)
      .eq('checkin_date', today)
      .select()
      .single();

    if (error) {
      this.logger.error('Error doctor check-out:', error);
      throw new BadRequestException('Failed to check out doctor');
    }

    this.logger.log(`Doctor ${doctorProfileId} checked out`);

    return data;
  }

  /**
   * Remove patient from queue
   */
  async removeFromQueue(
    hospitalId: string,
    entryId: string,
  ): Promise<void> {
    const adminClient = this.getAdminClientOrThrow();

    const { error } = await adminClient
      .from('queue_entries')
      .delete()
      .eq('id', entryId)
      .eq('hospital_id', hospitalId);

    if (error) {
      this.logger.error('Error removing from queue:', error);
      throw new BadRequestException('Failed to remove from queue');
    }

    this.logger.log(`Removed queue entry ${entryId}`);
  }

  private mapQueueEntry(entry: any): QueueEntryDto {
    return {
      id: entry.id,
      hospitalId: entry.hospital_id,
      doctorProfileId: entry.doctor_profile_id,
      patientId: entry.patient_id,
      appointmentId: entry.appointment_id,
      queueDate: entry.queue_date,
      queueNumber: entry.queue_number,
      entryType: entry.entry_type,
      status: entry.status,
      priority: entry.priority,
      walkInName: entry.walk_in_name,
      walkInPhone: entry.walk_in_phone,
      reasonForVisit: entry.reason_for_visit,
      checkedInAt: entry.checked_in_at,
      calledAt: entry.called_at,
      withDoctorAt: entry.with_doctor_at,
      completedAt: entry.completed_at,
      notes: entry.notes,
      waitTimeMinutes: entry.wait_time_minutes,
      consultationTimeMinutes: entry.consultation_time_minutes,
      statusToken: entry.status_token,
      patient: entry.patients ? {
        id: entry.patients.id,
        firstName: entry.patients.first_name,
        lastName: entry.patients.last_name,
        phone: entry.patients.phone,
      } : undefined,
    };
  }

  /**
   * Get queue status by public token (no auth required)
   */
  async getQueueStatusByToken(token: string): Promise<PublicQueueStatusDto> {
    const adminClient = this.getAdminClientOrThrow();

    // Fetch the queue entry by token
    const { data: entry, error } = await adminClient
      .from('queue_entries')
      .select('*, patients (id, first_name, last_name, phone)')
      .eq('status_token', token)
      .single();

    if (error || !entry) {
      throw new NotFoundException('Queue entry not found or link expired');
    }

    // Validate it's for today (link only valid for the day)
    const hospitalId = entry.hospital_id;
    const today = await this.getHospitalToday(hospitalId);
    if (entry.queue_date !== today) {
      throw new BadRequestException('This queue link has expired. Links are only valid for the day.');
    }

    // Get doctor info
    const { data: doctor } = await adminClient
      .from('doctor_profiles')
      .select('full_name, appointment_duration_minutes')
      .eq('id', entry.doctor_profile_id)
      .single();

    // Get hospital info
    const { data: hospital } = await adminClient
      .from('hospitals')
      .select('name, logo_url')
      .eq('id', hospitalId)
      .single();

    // Get doctor check-in status
    const { data: doctorCheckin } = await adminClient
      .from('doctor_daily_checkins')
      .select('status')
      .eq('doctor_profile_id', entry.doctor_profile_id)
      .eq('checkin_date', today)
      .single();

    // Get all active queue entries for this doctor/date to calculate position
    // Include appointment_id to look up individual durations
    const { data: allEntries } = await adminClient
      .from('queue_entries')
      .select('id, queue_number, status, consultation_time_minutes, with_doctor_at, appointment_id')
      .eq('doctor_profile_id', entry.doctor_profile_id)
      .eq('queue_date', today)
      .order('queue_number', { ascending: true });

    const activeStatuses = ['QUEUED', 'WAITING', 'WITH_DOCTOR'];
    const entriesAhead = (allEntries || []).filter(
      (e: any) => activeStatuses.includes(e.status) && e.queue_number < entry.queue_number
    );
    const ahead = entriesAhead.length;
    const behind = (allEntries || []).filter(
      (e: any) => activeStatuses.includes(e.status) && e.queue_number > entry.queue_number
    ).length;

    // Estimate wait time by summing individual durations for each patient ahead
    let estimatedWaitMinutes: number | null = null;
    if (activeStatuses.includes(entry.status) && entry.status !== 'WITH_DOCTOR') {
      // Use doctor's configured appointment duration as baseline (default 30 min)
      const defaultDuration = doctor?.appointment_duration_minutes || 30;

      // Get appointment durations for entries that have appointment_id
      const appointmentIds = entriesAhead
        .filter((e: any) => e.appointment_id)
        .map((e: any) => e.appointment_id);

      let appointmentDurations: Record<string, number> = {};
      if (appointmentIds.length > 0) {
        const { data: appointments } = await adminClient
          .from('appointments')
          .select('id, duration_minutes')
          .in('id', appointmentIds);

        if (appointments) {
          appointmentDurations = appointments.reduce((acc: Record<string, number>, appt: any) => {
            acc[appt.id] = appt.duration_minutes;
            return acc;
          }, {});
        }
      }

      // Calculate average from completed entries to use as fallback for walk-ins
      const completedEntries = (allEntries || []).filter(
        (e: any) => e.status === 'COMPLETED' && e.consultation_time_minutes
      );
      let avgConsultation = defaultDuration;
      if (completedEntries.length >= 3) {
        const rawAvg = completedEntries.reduce((sum: number, e: any) => sum + e.consultation_time_minutes, 0) / completedEntries.length;
        avgConsultation = Math.max(rawAvg, defaultDuration / 2);
      }

      // Check if someone is currently WITH_DOCTOR and estimate their remaining time
      const currentWithDoctor = (allEntries || []).find(
        (e: any) => e.status === 'WITH_DOCTOR' && e.with_doctor_at
      );

      let remainingForCurrent = 0;
      if (currentWithDoctor) {
        // Get the duration for current patient
        const currentDuration = currentWithDoctor.appointment_id && appointmentDurations[currentWithDoctor.appointment_id]
          ? appointmentDurations[currentWithDoctor.appointment_id]
          : avgConsultation;

        const elapsedMs = Date.now() - new Date(currentWithDoctor.with_doctor_at).getTime();
        const elapsedMin = elapsedMs / 60000;
        remainingForCurrent = Math.max(0, currentDuration - elapsedMin);
      }

      // Sum up individual durations for all patients waiting ahead (excluding current WITH_DOCTOR)
      const waitingAhead = entriesAhead.filter((e: any) => e.status !== 'WITH_DOCTOR');
      let totalWaitingDuration = 0;
      for (const patient of waitingAhead) {
        // Use appointment duration if available, otherwise use average
        const patientDuration = patient.appointment_id && appointmentDurations[patient.appointment_id]
          ? appointmentDurations[patient.appointment_id]
          : avgConsultation;
        totalWaitingDuration += patientDuration;
      }

      estimatedWaitMinutes = Math.round(remainingForCurrent + totalWaitingDuration);
    }

    // Patient name
    const patientName = entry.patients
      ? `${entry.patients.first_name} ${entry.patients.last_name}`
      : entry.walk_in_name || 'Patient';

    // Can cancel only if still QUEUED or WAITING
    const canCancel = ['QUEUED', 'WAITING'].includes(entry.status);

    return {
      patientName,
      queueNumber: entry.queue_number,
      status: entry.status,
      priority: entry.priority,
      reasonForVisit: entry.reason_for_visit,
      checkedInAt: entry.checked_in_at,
      calledAt: entry.called_at,
      withDoctorAt: entry.with_doctor_at,
      completedAt: entry.completed_at,
      waitTimeMinutes: entry.wait_time_minutes,
      patientsAhead: ahead,
      patientsBehind: behind,
      estimatedWaitMinutes,
      doctorName: doctor?.full_name || 'Doctor',
      doctorCheckedIn: doctorCheckin?.status === 'CHECKED_IN',
      hospitalName: hospital?.name || 'Hospital',
      hospitalLogoUrl: hospital?.logo_url || null,
      queueDate: entry.queue_date,
      canCancel,
    };
  }

  /**
   * Cancel queue entry by public token
   */
  async cancelQueueByToken(token: string): Promise<{ success: boolean }> {
    const adminClient = this.getAdminClientOrThrow();

    // Fetch the entry
    const { data: entry, error } = await adminClient
      .from('queue_entries')
      .select('id, status, queue_date, hospital_id')
      .eq('status_token', token)
      .single();

    if (error || !entry) {
      throw new NotFoundException('Queue entry not found');
    }

    // Validate it's for today
    const today = await this.getHospitalToday(entry.hospital_id);
    if (entry.queue_date !== today) {
      throw new BadRequestException('This queue link has expired');
    }

    if (!['QUEUED', 'WAITING'].includes(entry.status)) {
      throw new BadRequestException('Cannot cancel — you are already being seen or have been completed');
    }

    // Update status to LEFT
    const { error: updateError } = await adminClient
      .from('queue_entries')
      .update({
        status: 'LEFT',
        completed_at: new Date().toISOString(),
      })
      .eq('id', entry.id);

    if (updateError) {
      this.logger.error('Error cancelling queue entry by token:', updateError);
      throw new BadRequestException('Failed to cancel');
    }

    this.logger.log(`Patient cancelled queue entry ${entry.id} via public link`);
    return { success: true };
  }

  /**
   * Get queue stats for trends (walk-ins by date)
   */
  async getQueueStats(
    hospitalId: string,
    startDate: string,
    endDate: string,
    doctorProfileId?: string,
  ): Promise<{ date: string; walkIns: number; scheduled: number }[]> {
    const adminClient = this.getAdminClientOrThrow();

    let query = adminClient
      .from('queue_entries')
      .select('queue_date, entry_type')
      .eq('hospital_id', hospitalId)
      .gte('queue_date', startDate)
      .lte('queue_date', endDate);

    if (doctorProfileId) {
      query = query.eq('doctor_profile_id', doctorProfileId);
    }

    const { data: entries, error } = await query;

    if (error) {
      this.logger.error('Error fetching queue stats:', error);
      throw new BadRequestException('Failed to fetch queue stats');
    }

    // Group by date and count
    const statsByDate: Record<string, { walkIns: number; scheduled: number }> = {};

    (entries || []).forEach((entry: any) => {
      const date = entry.queue_date;
      if (!statsByDate[date]) {
        statsByDate[date] = { walkIns: 0, scheduled: 0 };
      }
      if (entry.entry_type === 'WALK_IN') {
        statsByDate[date].walkIns++;
      } else {
        statsByDate[date].scheduled++;
      }
    });

    // Convert to array sorted by date
    return Object.entries(statsByDate)
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
