import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class DoctorsService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get or create doctor profile for a user in a hospital
   */
  async getOrCreateDoctorProfile(userId: string, hospitalId: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    // Try to get existing profile
    const { data: existingProfile } = await adminClient
      .from('doctor_profiles')
      .select('*')
      .eq('user_id', userId)
      .eq('hospital_id', hospitalId)
      .single();

    if (existingProfile) {
      return existingProfile;
    }

    // Create new profile
    const { data: newProfile, error } = await adminClient
      .from('doctor_profiles')
      .insert({
        user_id: userId,
        hospital_id: hospitalId,
      })
      .select()
      .single();

    if (error) {
      console.error('[DoctorsService] Error creating doctor profile:', error);
      throw error;
    }

    return newProfile;
  }

  /**
   * Get time-off entries for a doctor
   */
  async getTimeOff(userId: string, hospitalId: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    // First get doctor profile
    const profile = await this.getOrCreateDoctorProfile(userId, hospitalId);

    const { data, error } = await adminClient
      .from('doctor_time_off')
      .select('*')
      .eq('doctor_profile_id', profile.id)
      .order('start_date', { ascending: true });

    if (error) {
      console.error('[DoctorsService] Error fetching time-off:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Add time-off entry for a doctor
   */
  async addTimeOff(
    userId: string,
    hospitalId: string,
    startDate: string,
    endDate: string,
    reason?: string,
  ) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    // First get doctor profile
    const profile = await this.getOrCreateDoctorProfile(userId, hospitalId);

    const { data, error } = await adminClient
      .from('doctor_time_off')
      .insert({
        doctor_profile_id: profile.id,
        start_date: startDate,
        end_date: endDate,
        reason: reason || null,
        status: 'approved',
      })
      .select()
      .single();

    if (error) {
      console.error('[DoctorsService] Error adding time-off:', error);
      throw error;
    }

    return data;
  }

  /**
   * Delete time-off entry
   */
  async deleteTimeOff(timeOffId: string, userId: string, hospitalId: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    // Verify the time-off belongs to this doctor's profile
    const profile = await this.getOrCreateDoctorProfile(userId, hospitalId);

    const { error } = await adminClient
      .from('doctor_time_off')
      .delete()
      .eq('id', timeOffId)
      .eq('doctor_profile_id', profile.id);

    if (error) {
      console.error('[DoctorsService] Error deleting time-off:', error);
      throw error;
    }

    return { success: true };
  }

  /**
   * Get appointment duration for a doctor
   */
  async getAppointmentDuration(userId: string, hospitalId: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    const profile = await this.getOrCreateDoctorProfile(userId, hospitalId);

    return {
      appointmentDurationMinutes: profile.appointment_duration_minutes || 30,
    };
  }

  /**
   * Update appointment duration for a doctor
   */
  async updateAppointmentDuration(
    userId: string,
    hospitalId: string,
    durationMinutes: number,
  ) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    const profile = await this.getOrCreateDoctorProfile(userId, hospitalId);

    const { data, error } = await adminClient
      .from('doctor_profiles')
      .update({ appointment_duration_minutes: durationMinutes })
      .eq('id', profile.id)
      .select()
      .single();

    if (error) {
      console.error('[DoctorsService] Error updating appointment duration:', error);
      throw error;
    }

    return {
      appointmentDurationMinutes: data.appointment_duration_minutes,
    };
  }

  /**
   * Get schedules for a doctor
   */
  async getSchedules(userId: string, hospitalId: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    const profile = await this.getOrCreateDoctorProfile(userId, hospitalId);

    const { data, error } = await adminClient
      .from('doctor_schedules')
      .select('*')
      .eq('doctor_profile_id', profile.id)
      .order('day_of_week', { ascending: true });

    if (error) {
      console.error('[DoctorsService] Error fetching schedules:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Save schedules for a doctor
   * Expects schedule array with dayOfWeek, isWorking, shiftStart, shiftEnd
   */
  async saveSchedules(
    userId: string,
    hospitalId: string,
    schedules: Array<{
      dayOfWeek: number;
      isWorking: boolean;
      shiftStart: string | null;
      shiftEnd: string | null;
    }>,
  ) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    const profile = await this.getOrCreateDoctorProfile(userId, hospitalId);

    // Delete existing schedules for this doctor
    await adminClient
      .from('doctor_schedules')
      .delete()
      .eq('doctor_profile_id', profile.id);

    // Insert new schedules
    const schedulesToInsert = schedules.map((s) => ({
      doctor_profile_id: profile.id,
      day_of_week: s.dayOfWeek,
      is_working: s.isWorking,
      shift_start: s.shiftStart,
      shift_end: s.shiftEnd,
    }));

    const { data, error } = await adminClient
      .from('doctor_schedules')
      .insert(schedulesToInsert)
      .select();

    if (error) {
      console.error('[DoctorsService] Error saving schedules:', error);
      throw error;
    }

    console.log(`[DoctorsService] Saved ${data.length} schedules for doctor ${userId}`);
    return data;
  }

  /**
   * Get doctor dashboard data including profile, schedules, and today's check-in status
   */
  async getDoctorDashboard(userId: string, hospitalId: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    // Get doctor profile
    const profile = await this.getOrCreateDoctorProfile(userId, hospitalId);

    // Get user info
    const { data: userData } = await adminClient
      .from('profiles')
      .select('full_name, email, phone')
      .eq('id', userId)
      .single();

    // Get schedules
    const { data: schedules } = await adminClient
      .from('doctor_schedules')
      .select('*')
      .eq('doctor_profile_id', profile.id)
      .order('day_of_week', { ascending: true });

    // Get upcoming time off
    const today = new Date().toISOString().split('T')[0];
    const { data: timeOffs } = await adminClient
      .from('doctor_time_off')
      .select('*')
      .eq('doctor_profile_id', profile.id)
      .gte('end_date', today)
      .order('start_date', { ascending: true })
      .limit(5);

    // Get today's check-in status
    const { data: checkinData } = await adminClient
      .from('doctor_daily_checkins')
      .select('*')
      .eq('doctor_profile_id', profile.id)
      .eq('checkin_date', today)
      .single();

    return {
      profile: {
        id: profile.id,
        userId: profile.user_id,
        hospitalId: profile.hospital_id,
        // Personal
        phone: profile.phone || '',
        dateOfBirth: profile.date_of_birth || '',
        gender: profile.gender || '',
        address: profile.address || '',
        emergencyContact: profile.emergency_contact || '',
        emergencyPhone: profile.emergency_phone || '',
        // Professional
        specialization: profile.specialization || '',
        qualification: profile.qualification || '',
        licenseNumber: profile.license_number || '',
        yearsOfExperience: profile.years_of_experience,
        consultationFee: profile.consultation_fee,
        education: profile.education || '',
        bio: profile.bio || '',
        appointmentDurationMinutes: profile.appointment_duration_minutes || 30,
        avatarUrl: profile.avatar_url || null,
      },
      user: userData ? {
        fullName: userData.full_name,
        email: userData.email,
        phone: userData.phone,
      } : null,
      schedules: (schedules || []).map(s => ({
        dayOfWeek: s.day_of_week,
        isWorking: s.is_working,
        shiftStart: s.shift_start,
        shiftEnd: s.shift_end,
      })),
      timeOffs: (timeOffs || []).map(t => ({
        id: t.id,
        startDate: t.start_date,
        endDate: t.end_date,
        reason: t.reason,
      })),
      checkin: checkinData ? {
        status: checkinData.status,
        checkedInAt: checkinData.checked_in_at,
        checkedOutAt: checkinData.checked_out_at,
      } : {
        status: 'NOT_CHECKED_IN',
        checkedInAt: null,
        checkedOutAt: null,
      },
    };
  }

  /**
   * Get doctor's stats for today, week, and month
   */
  async getDoctorStats(userId: string, hospitalId: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    const profile = await this.getOrCreateDoctorProfile(userId, hospitalId);
    const today = new Date().toISOString().split('T')[0];

    // Get today's appointments count (scheduled)
    const { count: totalAppointments } = await adminClient
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_profile_id', profile.id)
      .eq('appointment_date', today)
      .in('status', ['SCHEDULED', 'CONFIRMED']);

    // Get today's completed appointments
    const { count: todayCompletedAppt } = await adminClient
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_profile_id', profile.id)
      .eq('appointment_date', today)
      .eq('status', 'COMPLETED');

    // Get today's cancelled appointments
    const { count: todayCancelled } = await adminClient
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_profile_id', profile.id)
      .eq('appointment_date', today)
      .eq('status', 'CANCELLED');

    // Get today's no shows
    const { count: todayNoShow } = await adminClient
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_profile_id', profile.id)
      .eq('appointment_date', today)
      .eq('status', 'NO_SHOW');

    // Get queue stats
    const { count: totalQueue } = await adminClient
      .from('queue_entries')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_profile_id', profile.id)
      .eq('queue_date', today)
      .in('status', ['QUEUED', 'WITH_DOCTOR']);

    const { count: waitingCount } = await adminClient
      .from('queue_entries')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_profile_id', profile.id)
      .eq('queue_date', today)
      .eq('status', 'WAITING');

    const { count: completedQueue } = await adminClient
      .from('queue_entries')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_profile_id', profile.id)
      .eq('queue_date', today)
      .eq('status', 'COMPLETED');

    // Get this week's stats
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().split('T')[0];

    const { count: weekAppointments } = await adminClient
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_profile_id', profile.id)
      .gte('appointment_date', weekStartStr)
      .lte('appointment_date', today);

    const { count: weekCompleted } = await adminClient
      .from('queue_entries')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_profile_id', profile.id)
      .gte('queue_date', weekStartStr)
      .lte('queue_date', today)
      .eq('status', 'COMPLETED');

    const { count: weekCancelled } = await adminClient
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_profile_id', profile.id)
      .gte('appointment_date', weekStartStr)
      .lte('appointment_date', today)
      .eq('status', 'CANCELLED');

    const { count: weekNoShow } = await adminClient
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_profile_id', profile.id)
      .gte('appointment_date', weekStartStr)
      .lte('appointment_date', today)
      .eq('status', 'NO_SHOW');

    // Get this month's stats
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().split('T')[0];

    const { count: monthAppointments } = await adminClient
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_profile_id', profile.id)
      .gte('appointment_date', monthStartStr)
      .lte('appointment_date', today);

    const { count: monthCompleted } = await adminClient
      .from('queue_entries')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_profile_id', profile.id)
      .gte('queue_date', monthStartStr)
      .lte('queue_date', today)
      .eq('status', 'COMPLETED');

    const { count: monthCancelled } = await adminClient
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_profile_id', profile.id)
      .gte('appointment_date', monthStartStr)
      .lte('appointment_date', today)
      .eq('status', 'CANCELLED');

    const { count: monthNoShow } = await adminClient
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_profile_id', profile.id)
      .gte('appointment_date', monthStartStr)
      .lte('appointment_date', today)
      .eq('status', 'NO_SHOW');

    // Get total unique patients seen
    const { data: patientsData } = await adminClient
      .from('queue_entries')
      .select('patient_id')
      .eq('doctor_profile_id', profile.id)
      .eq('status', 'COMPLETED');

    const uniquePatients = new Set((patientsData || []).map((p: any) => p.patient_id));

    // Get average wait time (from completed queue entries today)
    const { data: waitTimeData } = await adminClient
      .from('queue_entries')
      .select('wait_time_minutes')
      .eq('doctor_profile_id', profile.id)
      .eq('queue_date', today)
      .eq('status', 'COMPLETED')
      .not('wait_time_minutes', 'is', null);

    const avgWaitTime = waitTimeData && waitTimeData.length > 0
      ? Math.round(waitTimeData.reduce((sum: number, e: any) => sum + (e.wait_time_minutes || 0), 0) / waitTimeData.length)
      : 0;

    return {
      today: {
        appointments: totalAppointments || 0,
        completedAppointments: todayCompletedAppt || 0,
        inQueue: totalQueue || 0,
        waiting: waitingCount || 0,
        completed: completedQueue || 0,
        cancelled: todayCancelled || 0,
        noShow: todayNoShow || 0,
      },
      week: {
        appointments: weekAppointments || 0,
        completed: weekCompleted || 0,
        cancelled: weekCancelled || 0,
        noShow: weekNoShow || 0,
      },
      month: {
        appointments: monthAppointments || 0,
        completed: monthCompleted || 0,
        cancelled: monthCancelled || 0,
        noShow: monthNoShow || 0,
      },
      totalPatients: uniquePatients.size,
      avgWaitTime,
    };
  }

  /**
   * Update doctor profile (for doctor updating their own profile)
   */
  async updateDoctorProfile(
    userId: string,
    hospitalId: string,
    data: {
      phone?: string;
      dateOfBirth?: string;
      gender?: string;
      address?: string;
      emergencyContact?: string;
      emergencyPhone?: string;
      specialization?: string;
      qualification?: string;
      licenseNumber?: string;
      experience?: number;
      consultationFee?: number;
      education?: string;
      bio?: string;
    },
  ) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    const profile = await this.getOrCreateDoctorProfile(userId, hospitalId);

    const updateData: any = {};
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.dateOfBirth !== undefined) updateData.date_of_birth = data.dateOfBirth;
    if (data.gender !== undefined) updateData.gender = data.gender;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.emergencyContact !== undefined) updateData.emergency_contact = data.emergencyContact;
    if (data.emergencyPhone !== undefined) updateData.emergency_phone = data.emergencyPhone;
    if (data.specialization !== undefined) updateData.specialization = data.specialization;
    if (data.qualification !== undefined) updateData.qualification = data.qualification;
    if (data.licenseNumber !== undefined) updateData.license_number = data.licenseNumber;
    if (data.experience !== undefined) updateData.years_of_experience = data.experience;
    if (data.consultationFee !== undefined) updateData.consultation_fee = data.consultationFee;
    if (data.education !== undefined) updateData.education = data.education;
    if (data.bio !== undefined) updateData.bio = data.bio;

    const { data: updated, error } = await adminClient
      .from('doctor_profiles')
      .update(updateData)
      .eq('id', profile.id)
      .select()
      .single();

    if (error) {
      console.error('[DoctorsService] Error updating profile:', error);
      throw error;
    }

    return {
      id: updated.id,
      userId: updated.user_id,
      hospitalId: updated.hospital_id,
      phone: updated.phone,
      dateOfBirth: updated.date_of_birth,
      gender: updated.gender,
      address: updated.address,
      emergencyContact: updated.emergency_contact,
      emergencyPhone: updated.emergency_phone,
      specialization: updated.specialization,
      qualification: updated.qualification,
      licenseNumber: updated.license_number,
      yearsOfExperience: updated.years_of_experience,
      consultationFee: updated.consultation_fee,
      education: updated.education,
      bio: updated.bio,
      appointmentDurationMinutes: updated.appointment_duration_minutes,
    };
  }

  /**
   * Update doctor avatar
   */
  async updateDoctorAvatar(userId: string, hospitalId: string, avatarUrl: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    const profile = await this.getOrCreateDoctorProfile(userId, hospitalId);

    const { data: updated, error } = await adminClient
      .from('doctor_profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', profile.id)
      .select()
      .single();

    if (error) {
      console.error('[DoctorsService] Error updating avatar:', error);
      throw error;
    }

    return {
      avatarUrl: updated.avatar_url,
    };
  }

  /**
   * Get a specific doctor's profile by userId (for managers)
   */
  async getDoctorProfileById(userId: string, hospitalId: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    // Get doctor profile
    const profile = await this.getOrCreateDoctorProfile(userId, hospitalId);

    // Get user info
    const { data: userData } = await adminClient
      .from('profiles')
      .select('full_name, email, phone')
      .eq('id', userId)
      .single();

    return {
      id: profile.id,
      userId: profile.user_id,
      hospitalId: profile.hospital_id,
      fullName: userData?.full_name || '',
      email: userData?.email || '',
      phone: profile.phone || '',
      dateOfBirth: profile.date_of_birth || '',
      gender: profile.gender || '',
      address: profile.address || '',
      emergencyContact: profile.emergency_contact || '',
      emergencyPhone: profile.emergency_phone || '',
      specialization: profile.specialization || '',
      qualification: profile.qualification || '',
      licenseNumber: profile.license_number || '',
      yearsOfExperience: profile.years_of_experience,
      consultationFee: profile.consultation_fee,
      education: profile.education || '',
      bio: profile.bio || '',
      avatarUrl: profile.avatar_url || '',
      appointmentDurationMinutes: profile.appointment_duration_minutes || 30,
      createdAt: profile.created_at,
    };
  }

  /**
   * Update a specific doctor's profile by userId (for managers)
   */
  async updateDoctorProfileById(
    userId: string,
    hospitalId: string,
    data: {
      fullName?: string;
      phone?: string;
      dateOfBirth?: string;
      gender?: string;
      address?: string;
      emergencyContact?: string;
      emergencyPhone?: string;
      specialization?: string;
      qualification?: string;
      licenseNumber?: string;
      yearsOfExperience?: number;
      consultationFee?: number;
      education?: string;
      bio?: string;
    },
  ) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    const profile = await this.getOrCreateDoctorProfile(userId, hospitalId);

    // Build update object for doctor_profiles
    const updateData: any = {};
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.dateOfBirth !== undefined) updateData.date_of_birth = data.dateOfBirth;
    if (data.gender !== undefined) updateData.gender = data.gender;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.emergencyContact !== undefined) updateData.emergency_contact = data.emergencyContact;
    if (data.emergencyPhone !== undefined) updateData.emergency_phone = data.emergencyPhone;
    if (data.specialization !== undefined) updateData.specialization = data.specialization;
    if (data.qualification !== undefined) updateData.qualification = data.qualification;
    if (data.licenseNumber !== undefined) updateData.license_number = data.licenseNumber;
    if (data.yearsOfExperience !== undefined) updateData.years_of_experience = data.yearsOfExperience;
    if (data.consultationFee !== undefined) updateData.consultation_fee = data.consultationFee;
    if (data.education !== undefined) updateData.education = data.education;
    if (data.bio !== undefined) updateData.bio = data.bio;

    // Update doctor_profiles table
    const { data: updated, error } = await adminClient
      .from('doctor_profiles')
      .update(updateData)
      .eq('id', profile.id)
      .select()
      .single();

    if (error) {
      console.error('[DoctorsService] Error updating doctor profile:', error);
      throw error;
    }

    // Also update fullName in profiles table if provided
    if (data.fullName) {
      await adminClient
        .from('profiles')
        .update({ full_name: data.fullName })
        .eq('id', userId);
    }

    return {
      id: updated.id,
      userId: updated.user_id,
      hospitalId: updated.hospital_id,
      phone: updated.phone,
      dateOfBirth: updated.date_of_birth,
      gender: updated.gender,
      address: updated.address,
      emergencyContact: updated.emergency_contact,
      emergencyPhone: updated.emergency_phone,
      specialization: updated.specialization,
      qualification: updated.qualification,
      licenseNumber: updated.license_number,
      yearsOfExperience: updated.years_of_experience,
      consultationFee: updated.consultation_fee,
      education: updated.education,
      bio: updated.bio,
      appointmentDurationMinutes: updated.appointment_duration_minutes,
    };
  }

  /**
   * Doctor check-in for the day (creates a new event)
   */
  async doctorCheckIn(userId: string, hospitalId: string, date?: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    const profile = await this.getOrCreateDoctorProfile(userId, hospitalId);
    const eventDate = date || new Date().toISOString().split('T')[0];

    // Create a new check-in event
    const { data, error } = await adminClient
      .from('doctor_checkin_events')
      .insert({
        doctor_profile_id: profile.id,
        hospital_id: hospitalId,
        event_date: eventDate,
        event_type: 'CHECK_IN',
        event_time: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[DoctorsService] Error creating check-in event:', error);
      throw error;
    }

    return {
      id: data.id,
      eventType: data.event_type,
      eventTime: data.event_time,
    };
  }

  /**
   * Doctor check-out for the day (creates a new event)
   */
  async doctorCheckOut(userId: string, hospitalId: string, date?: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    const profile = await this.getOrCreateDoctorProfile(userId, hospitalId);
    const eventDate = date || new Date().toISOString().split('T')[0];

    // Create a new check-out event
    const { data, error } = await adminClient
      .from('doctor_checkin_events')
      .insert({
        doctor_profile_id: profile.id,
        hospital_id: hospitalId,
        event_date: eventDate,
        event_type: 'CHECK_OUT',
        event_time: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[DoctorsService] Error creating check-out event:', error);
      throw error;
    }

    return {
      id: data.id,
      eventType: data.event_type,
      eventTime: data.event_time,
    };
  }

  /**
   * Get doctor's queue for a specific date
   */
  async getDoctorQueue(userId: string, hospitalId: string, date: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    const profile = await this.getOrCreateDoctorProfile(userId, hospitalId);

    // Get all check-in/check-out events for the day
    const { data: checkinEvents } = await adminClient
      .from('doctor_checkin_events')
      .select('*')
      .eq('doctor_profile_id', profile.id)
      .eq('event_date', date)
      .order('event_time', { ascending: true });

    // Get queue entries for this doctor on this date
    const { data: queueData, error } = await adminClient
      .from('queue_entries')
      .select(`
        *,
        patient:patients(id, first_name, last_name, phone)
      `)
      .eq('doctor_profile_id', profile.id)
      .eq('queue_date', date)
      .order('queue_number', { ascending: true });

    if (error) {
      console.error('[DoctorsService] Error fetching queue:', error);
      throw error;
    }

    const queue = queueData || [];

    // Categorize entries
    const inQueue = queue.filter(e => e.status === 'QUEUED');
    const waiting = queue.filter(e => e.status === 'WAITING');
    const withDoctor = queue.find(e => e.status === 'WITH_DOCTOR') || null;
    const completed = queue.filter(e => e.status === 'COMPLETED');

    const formatEntry = (e: any) => ({
      id: e.id,
      queueNumber: e.queue_number,
      entryType: e.entry_type,
      status: e.status,
      priority: e.priority,
      walkInName: e.walk_in_name,
      walkInPhone: e.walk_in_phone,
      reasonForVisit: e.reason_for_visit,
      checkedInAt: e.checked_in_at,
      calledAt: e.called_at,
      withDoctorAt: e.with_doctor_at,
      completedAt: e.completed_at,
      waitTimeMinutes: e.wait_time_minutes,
      patient: e.patient ? {
        id: e.patient.id,
        firstName: e.patient.first_name,
        lastName: e.patient.last_name,
        phone: e.patient.phone,
      } : null,
    });

    // Format check-in events
    const events = (checkinEvents || []).map((e: any) => ({
      id: e.id,
      eventType: e.event_type,
      eventTime: e.event_time,
    }));

    // Determine current status based on events
    const lastEvent = events.length > 0 ? events[events.length - 1] : null;
    const isCheckedIn = lastEvent?.eventType === 'CHECK_IN';

    // Combine queued and waiting as "in queue"
    const inQueueList = [...inQueue, ...waiting];

    return {
      date,
      checkinEvents: events,
      isCheckedIn,
      queue: inQueueList.map(formatEntry),
      withDoctor: withDoctor ? formatEntry(withDoctor) : null,
      completed: completed.map(formatEntry),
      stats: {
        totalInQueue: inQueueList.length,
        totalWithDoctor: withDoctor ? 1 : 0,
        totalCompleted: completed.length,
      },
    };
  }

  /**
   * Get doctor's appointments calendar for a month
   */
  async getDoctorAppointmentsCalendar(
    userId: string,
    hospitalId: string,
    year: number,
    month: number,
  ) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    const profile = await this.getOrCreateDoctorProfile(userId, hospitalId);

    // Calculate date range for the month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    // Get all appointments for this month
    const { data: appointments, error } = await adminClient
      .from('appointments')
      .select('appointment_date, status')
      .eq('doctor_profile_id', profile.id)
      .gte('appointment_date', startDate)
      .lte('appointment_date', endDate);

    if (error) {
      console.error('[DoctorsService] Error fetching calendar:', error);
      throw error;
    }

    // Group by date
    const dateMap: Record<string, { count: number; hasAppointments: boolean }> = {};
    (appointments || []).forEach((apt: any) => {
      if (!dateMap[apt.appointment_date]) {
        dateMap[apt.appointment_date] = { count: 0, hasAppointments: true };
      }
      dateMap[apt.appointment_date].count++;
    });

    return Object.entries(dateMap).map(([date, data]) => ({
      date,
      hasAppointments: data.hasAppointments,
      count: data.count,
    }));
  }

  /**
   * Get doctor's appointments for a specific date
   */
  async getDoctorAppointmentsByDate(userId: string, hospitalId: string, date: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new Error('Admin client not available');
    }

    const profile = await this.getOrCreateDoctorProfile(userId, hospitalId);

    const { data: appointments, error } = await adminClient
      .from('appointments')
      .select(`
        *,
        patient:patients(id, first_name, last_name, phone)
      `)
      .eq('doctor_profile_id', profile.id)
      .eq('appointment_date', date)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('[DoctorsService] Error fetching appointments:', error);
      throw error;
    }

    return {
      date,
      appointments: (appointments || []).map((apt: any) => ({
        id: apt.id,
        slotId: apt.slot_id,
        patientId: apt.patient_id,
        patientName: apt.patient
          ? `${apt.patient.first_name} ${apt.patient.last_name}`
          : 'Unknown',
        patientPhone: apt.patient?.phone,
        appointmentDate: apt.appointment_date,
        startTime: apt.start_time,
        endTime: apt.end_time,
        status: apt.status,
        reasonForVisit: apt.reason_for_visit,
        notes: apt.notes,
      })),
    };
  }
}
