import { Injectable, Logger, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateStaffDto, UpdateStaffDto, ResetPasswordDto, StaffResponseDto } from './dto/staff.dto';
import { DataScopingContext } from '../data-scoping/dto/data-scoping.dto';
import { getVisibleDoctorUserIds, getScopeType } from '../data-scoping/scoping.utils';

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(private supabaseService: SupabaseService) {}

  /**
   * Create a new staff member using Supabase auth
   * Manager creates the account directly with email/password (no email verification)
   */
  async createStaff(
    dto: CreateStaffDto,
    hospitalId: string,
    creatorUserId: string,
    accessToken: string,
  ): Promise<StaffResponseDto> {
    const supabase = this.supabaseService.getClientWithToken(accessToken);
    const adminClient = this.supabaseService.getAdminClient();

    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    // Verify creator is hospital manager or super admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', creatorUserId)
      .single();

    const isSuperAdmin = profile?.is_super_admin || false;

    if (!isSuperAdmin) {
      const { data: membership } = await supabase
        .from('hospital_memberships')
        .select('role')
        .eq('hospital_id', hospitalId)
        .eq('user_id', creatorUserId)
        .eq('status', 'ACTIVE')
        .single();

      if (membership?.role !== 'HOSPITAL_MANAGER') {
        throw new ForbiddenException('Only hospital managers can create staff accounts');
      }
    }

    // Check if email already exists
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('user_id')
      .eq('email', dto.email.toLowerCase())
      .single();

    if (existingProfile) {
      throw new BadRequestException('A user with this email already exists');
    }

    // Create Supabase auth user (auto-confirmed, no email verification)
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: dto.email.toLowerCase(),
      password: dto.password,
      email_confirm: true, // Skip email verification
      user_metadata: { full_name: dto.displayName },
    });

    if (authError || !authData.user) {
      this.logger.error(`Failed to create auth user: ${authError?.message}`);
      throw new BadRequestException(authError?.message || 'Failed to create user account');
    }

    const userId = authData.user.id;

    try {
      // Update the profile that was auto-created by the database trigger
      // The trigger creates profile with email and full_name, we just need to add phone
      if (dto.phone) {
        const { error: profileError } = await adminClient
          .from('profiles')
          .update({ phone: dto.phone })
          .eq('user_id', userId);

        if (profileError) {
          this.logger.error(`Failed to update profile: ${profileError.message}`);
          // Cleanup: delete auth user (will cascade delete profile)
          await adminClient.auth.admin.deleteUser(userId);
          throw new BadRequestException('Failed to update staff profile');
        }
      }

      // Create hospital_membership with STAFF role
      const { error: membershipError } = await adminClient
        .from('hospital_memberships')
        .insert({
          hospital_id: hospitalId,
          user_id: userId,
          role: 'STAFF',
          status: 'ACTIVE',
          title: dto.title || null,
          assigned_doctor_ids: dto.assignedDoctorIds || null,
        });

      if (membershipError) {
        this.logger.error(`Failed to create membership: ${membershipError.message}`);
        // Cleanup: delete auth user (profile cascades)
        await adminClient.auth.admin.deleteUser(userId);
        throw new BadRequestException('Failed to create staff membership');
      }

      // Fetch the hospital name for the response
      const { data: hospital } = await adminClient
        .from('hospitals')
        .select('name')
        .eq('id', hospitalId)
        .single();

      return {
        id: userId,
        email: dto.email.toLowerCase(),
        displayName: dto.displayName,
        title: dto.title || null,
        phone: dto.phone || null,
        status: 'ACTIVE',
        hospitalId,
        hospitalName: hospital?.name || '',
        assignedDoctorIds: dto.assignedDoctorIds || null,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      // Cleanup on any error
      await adminClient.auth.admin.deleteUser(userId).catch(() => {});
      throw error;
    }
  }

  /**
   * Get all staff members for a hospital, filtered by data scoping context
   * Staff are users with STAFF role in hospital_memberships
   */
  async getHospitalStaff(
    hospitalId: string,
    accessToken: string,
    scopingContext?: DataScopingContext | null,
  ): Promise<StaffResponseDto[]> {
    const scope = getScopeType(scopingContext, 'staff');
    if (scope === 'none') return [];

    const adminClient = this.supabaseService.getAdminClient();

    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    // Get all STAFF memberships for this hospital
    const { data: memberships, error } = await adminClient
      .from('hospital_memberships')
      .select('user_id, status, title, assigned_doctor_ids, created_at')
      .eq('hospital_id', hospitalId)
      .eq('role', 'STAFF')
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Failed to fetch staff memberships: ${error.message}`);
      throw new BadRequestException('Failed to fetch staff');
    }

    if (!memberships || memberships.length === 0) {
      return [];
    }

    // Apply "same_doctors" scoping: only show staff who share at least one assigned doctor
    let filteredMemberships = memberships;
    if (scope === 'same_doctors') {
      const visibleDocUserIds = getVisibleDoctorUserIds(scopingContext);
      if (visibleDocUserIds && visibleDocUserIds.length > 0) {
        filteredMemberships = memberships.filter(m => {
          const staffDoctors: string[] = m.assigned_doctor_ids || [];
          return staffDoctors.some(id => visibleDocUserIds.includes(id));
        });
      } else {
        return [];
      }
    }

    if (filteredMemberships.length === 0) return [];

    // Get profiles for these users
    const userIds = filteredMemberships.map(m => m.user_id);
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('user_id, email, full_name, phone')
      .in('user_id', userIds);

    // Get hospital name
    const { data: hospital } = await adminClient
      .from('hospitals')
      .select('name')
      .eq('id', hospitalId)
      .single();

    // Map profiles to memberships
    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

    return filteredMemberships.map(m => {
      const profile = profileMap.get(m.user_id);
      return {
        id: m.user_id,
        email: profile?.email || '',
        displayName: profile?.full_name || '',
        title: m.title || null,
        phone: profile?.phone || null,
        status: m.status,
        hospitalId,
        hospitalName: hospital?.name || '',
        assignedDoctorIds: m.assigned_doctor_ids || null,
        createdAt: m.created_at,
      };
    });
  }

  /**
   * Update a staff member
   */
  async updateStaff(
    staffUserId: string,
    dto: UpdateStaffDto,
    hospitalId: string,
    updaterUserId: string,
    accessToken: string,
  ): Promise<StaffResponseDto> {
    const supabase = this.supabaseService.getClientWithToken(accessToken);
    const adminClient = this.supabaseService.getAdminClient();

    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    // Verify updater is hospital manager or super admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', updaterUserId)
      .single();

    const isSuperAdmin = profile?.is_super_admin || false;

    if (!isSuperAdmin) {
      const { data: membership } = await supabase
        .from('hospital_memberships')
        .select('role')
        .eq('hospital_id', hospitalId)
        .eq('user_id', updaterUserId)
        .eq('status', 'ACTIVE')
        .single();

      if (membership?.role !== 'HOSPITAL_MANAGER') {
        throw new ForbiddenException('Only hospital managers can update staff');
      }
    }

    // Verify the staff member exists
    const { data: staffMembership } = await adminClient
      .from('hospital_memberships')
      .select('*')
      .eq('hospital_id', hospitalId)
      .eq('user_id', staffUserId)
      .eq('role', 'STAFF')
      .single();

    if (!staffMembership) {
      throw new NotFoundException('Staff member not found');
    }

    // Update profile if needed
    if (dto.displayName !== undefined || dto.phone !== undefined) {
      const profileUpdate: Record<string, any> = {};
      if (dto.displayName !== undefined) profileUpdate.full_name = dto.displayName;
      if (dto.phone !== undefined) profileUpdate.phone = dto.phone || null;

      await adminClient
        .from('profiles')
        .update(profileUpdate)
        .eq('user_id', staffUserId);
    }

    // Update membership if needed
    if (dto.status !== undefined || dto.title !== undefined || dto.assignedDoctorIds !== undefined) {
      const membershipUpdate: Record<string, any> = {};
      if (dto.status !== undefined) membershipUpdate.status = dto.status;
      if (dto.title !== undefined) membershipUpdate.title = dto.title || null;
      if (dto.assignedDoctorIds !== undefined) membershipUpdate.assigned_doctor_ids = dto.assignedDoctorIds;

      await adminClient
        .from('hospital_memberships')
        .update(membershipUpdate)
        .eq('hospital_id', hospitalId)
        .eq('user_id', staffUserId)
        .eq('role', 'STAFF');
    }

    // Fetch updated data
    const { data: updatedProfile } = await adminClient
      .from('profiles')
      .select('email, full_name, phone')
      .eq('user_id', staffUserId)
      .single();

    const { data: updatedMembership } = await adminClient
      .from('hospital_memberships')
      .select('status, title, assigned_doctor_ids, created_at')
      .eq('hospital_id', hospitalId)
      .eq('user_id', staffUserId)
      .eq('role', 'STAFF')
      .single();

    const { data: hospital } = await adminClient
      .from('hospitals')
      .select('name')
      .eq('id', hospitalId)
      .single();

    return {
      id: staffUserId,
      email: updatedProfile?.email || '',
      displayName: updatedProfile?.full_name || '',
      title: updatedMembership?.title || null,
      phone: updatedProfile?.phone || null,
      status: updatedMembership?.status || 'ACTIVE',
      hospitalId,
      hospitalName: hospital?.name || '',
      assignedDoctorIds: updatedMembership?.assigned_doctor_ids || null,
      createdAt: updatedMembership?.created_at || '',
    };
  }

  /**
   * Delete a staff member
   * Removes the hospital_membership and optionally deletes the auth user
   */
  async deleteStaff(
    staffUserId: string,
    hospitalId: string,
    deleterUserId: string,
    accessToken: string,
  ): Promise<{ success: boolean }> {
    const supabase = this.supabaseService.getClientWithToken(accessToken);
    const adminClient = this.supabaseService.getAdminClient();

    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    // Verify deleter is hospital manager or super admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', deleterUserId)
      .single();

    const isSuperAdmin = profile?.is_super_admin || false;

    if (!isSuperAdmin) {
      const { data: membership } = await supabase
        .from('hospital_memberships')
        .select('role')
        .eq('hospital_id', hospitalId)
        .eq('user_id', deleterUserId)
        .eq('status', 'ACTIVE')
        .single();

      if (membership?.role !== 'HOSPITAL_MANAGER') {
        throw new ForbiddenException('Only hospital managers can delete staff');
      }
    }

    // Verify the staff member exists
    const { data: staffMembership } = await adminClient
      .from('hospital_memberships')
      .select('*')
      .eq('hospital_id', hospitalId)
      .eq('user_id', staffUserId)
      .eq('role', 'STAFF')
      .single();

    if (!staffMembership) {
      throw new NotFoundException('Staff member not found');
    }

    // Delete the membership
    const { error: deleteError } = await adminClient
      .from('hospital_memberships')
      .delete()
      .eq('hospital_id', hospitalId)
      .eq('user_id', staffUserId)
      .eq('role', 'STAFF');

    if (deleteError) {
      this.logger.error(`Failed to delete staff membership: ${deleteError.message}`);
      throw new BadRequestException('Failed to delete staff');
    }

    // Check if user has other memberships
    const { data: otherMemberships } = await adminClient
      .from('hospital_memberships')
      .select('id')
      .eq('user_id', staffUserId)
      .eq('status', 'ACTIVE');

    // If no other memberships, delete the profile and auth user
    if (!otherMemberships || otherMemberships.length === 0) {
      await adminClient.from('profiles').delete().eq('user_id', staffUserId);
      await adminClient.auth.admin.deleteUser(staffUserId);
    }

    return { success: true };
  }

  /**
   * Reset a staff member's password
   */
  async resetPassword(
    staffUserId: string,
    newPassword: string,
    hospitalId: string,
    updaterUserId: string,
    accessToken: string,
  ): Promise<{ success: boolean }> {
    const supabase = this.supabaseService.getClientWithToken(accessToken);
    const adminClient = this.supabaseService.getAdminClient();

    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    // Verify updater is hospital manager or super admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', updaterUserId)
      .single();

    const isSuperAdmin = profile?.is_super_admin || false;

    if (!isSuperAdmin) {
      const { data: membership } = await supabase
        .from('hospital_memberships')
        .select('role')
        .eq('hospital_id', hospitalId)
        .eq('user_id', updaterUserId)
        .eq('status', 'ACTIVE')
        .single();

      if (membership?.role !== 'HOSPITAL_MANAGER') {
        throw new ForbiddenException('Only hospital managers can reset staff passwords');
      }
    }

    // Verify the staff member exists in this hospital
    const { data: staffMembership } = await adminClient
      .from('hospital_memberships')
      .select('user_id')
      .eq('hospital_id', hospitalId)
      .eq('user_id', staffUserId)
      .eq('role', 'STAFF')
      .single();

    if (!staffMembership) {
      throw new NotFoundException('Staff member not found');
    }

    // Reset password via Supabase admin API
    const { error } = await adminClient.auth.admin.updateUserById(staffUserId, {
      password: newPassword,
    });

    if (error) {
      this.logger.error(`Failed to reset password: ${error.message}`);
      throw new BadRequestException('Failed to reset password');
    }

    return { success: true };
  }
}
