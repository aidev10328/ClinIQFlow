import { Injectable, Logger, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateHospitalDto, UpdateHospitalDto, HospitalResponseDto } from './dto/hospital.dto';

@Injectable()
export class HospitalsService {
  private readonly logger = new Logger(HospitalsService.name);

  constructor(private supabaseService: SupabaseService) {}

  async createHospital(
    dto: CreateHospitalDto,
    userId: string,
    accessToken: string,
  ): Promise<HospitalResponseDto> {
    const supabase = this.supabaseService.getClientWithToken(accessToken);

    // Verify user is super admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', userId)
      .single();

    if (!profile?.is_super_admin) {
      throw new ForbiddenException('Only super admins can create hospitals');
    }

    // Create hospital
    const { data: hospital, error } = await supabase
      .from('hospitals')
      .insert({
        name: dto.name,
        address_line1: dto.addressLine1,
        address_line2: dto.addressLine2,
        city: dto.city,
        state: dto.state,
        postal: dto.postal,
        country: dto.country,
        region: dto.region,
        currency: dto.currency,
        timezone: dto.timezone,
        phone: dto.phone,
        email: dto.email,
        website: dto.website,
        logo_url: dto.logoUrl,
        picture_url: dto.pictureUrl,
        status: 'ACTIVE',
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create hospital: ${error.message}`);
      throw new BadRequestException('Failed to create hospital');
    }

    return this.mapToDto(hospital);
  }

  async getHospital(
    hospitalId: string,
    accessToken: string,
  ): Promise<HospitalResponseDto> {
    const supabase = this.supabaseService.getClientWithToken(accessToken);

    const { data: hospital, error } = await supabase
      .from('hospitals')
      .select()
      .eq('id', hospitalId)
      .single();

    if (error || !hospital) {
      throw new NotFoundException('Hospital not found');
    }

    return this.mapToDto(hospital);
  }

  async getAllHospitals(accessToken: string): Promise<HospitalResponseDto[]> {
    const supabase = this.supabaseService.getClientWithToken(accessToken);

    const { data: hospitals, error } = await supabase
      .from('hospitals')
      .select()
      .order('name');

    if (error) {
      throw new BadRequestException('Failed to fetch hospitals');
    }

    return (hospitals || []).map(h => this.mapToDto(h));
  }

  async updateHospital(
    hospitalId: string,
    dto: UpdateHospitalDto,
    userId: string,
    accessToken: string,
  ): Promise<HospitalResponseDto> {
    const supabase = this.supabaseService.getClientWithToken(accessToken);

    // Check if user is super admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', userId)
      .single();

    const isSuperAdmin = profile?.is_super_admin || false;

    // If not super admin, check if user is a Hospital Manager for this hospital
    if (!isSuperAdmin) {
      const { data: membership } = await supabase
        .from('hospital_memberships')
        .select('role')
        .eq('hospital_id', hospitalId)
        .eq('user_id', userId)
        .eq('status', 'ACTIVE')
        .single();

      if (!membership || membership.role !== 'HOSPITAL_MANAGER') {
        throw new ForbiddenException('Only super admins or hospital managers can update hospital details');
      }
    }

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.addressLine1 !== undefined) updateData.address_line1 = dto.addressLine1;
    if (dto.addressLine2 !== undefined) updateData.address_line2 = dto.addressLine2;
    if (dto.city !== undefined) updateData.city = dto.city;
    if (dto.state !== undefined) updateData.state = dto.state;
    if (dto.postal !== undefined) updateData.postal = dto.postal;
    if (dto.country !== undefined) updateData.country = dto.country;
    if (dto.region !== undefined) updateData.region = dto.region;
    if (dto.currency !== undefined) updateData.currency = dto.currency;
    if (dto.timezone !== undefined) updateData.timezone = dto.timezone;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.website !== undefined) updateData.website = dto.website;
    if (dto.logoUrl !== undefined) updateData.logo_url = dto.logoUrl;
    if (dto.pictureUrl !== undefined) updateData.picture_url = dto.pictureUrl;

    // Use admin client for the actual update to bypass RLS
    // (we've already verified the user has permission above)
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not available');
    }

    const { data: hospital, error } = await adminClient
      .from('hospitals')
      .update(updateData)
      .eq('id', hospitalId)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update hospital: ${error.message}`);
      throw new BadRequestException('Failed to update hospital');
    }

    return this.mapToDto(hospital);
  }

  async getHospitalMembers(hospitalId: string, accessToken: string) {
    // Use admin client to bypass RLS - managers need to see all members
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not configured');
    }

    // Fetch members without profile join (FK relationship may not exist)
    const { data: members, error } = await adminClient
      .from('hospital_memberships')
      .select('id, role, is_primary, status, created_at, user_id')
      .eq('hospital_id', hospitalId)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Failed to fetch members: ${error.message}`);
      throw new BadRequestException('Failed to fetch members');
    }

    // Fetch profiles separately
    const userIds = (members || []).map(m => m.user_id);
    const { data: profiles } = userIds.length > 0
      ? await adminClient.from('profiles').select('user_id, email, full_name').in('user_id', userIds)
      : { data: [] };

    // Create a map of user_id -> profile
    const profileMap = new Map<string, { email: string; full_name: string }>();
    for (const p of profiles || []) {
      profileMap.set(p.user_id, { email: p.email, full_name: p.full_name });
    }

    return (members || []).map(m => {
      const profile = profileMap.get(m.user_id);
      return {
        id: m.id,
        userId: m.user_id,
        email: profile?.email,
        fullName: profile?.full_name,
        role: m.role,
        isPrimary: m.is_primary,
        status: m.status,
        createdAt: m.created_at,
      };
    });
  }

  /**
   * Get hospital members with their compliance status (for admin view)
   * Returns enhanced member info including:
   * - complianceStatus: 'compliant' | 'pending_signatures' | 'invited'
   */
  async getHospitalMembersWithCompliance(hospitalId: string) {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new BadRequestException('Admin client not configured');
    }

    // Get all members (without profile join since FK relationship may not exist)
    const { data: members, error } = await adminClient
      .from('hospital_memberships')
      .select('id, role, is_primary, status, created_at, user_id')
      .eq('hospital_id', hospitalId)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Failed to fetch members: ${error.message}`);
      throw new BadRequestException('Failed to fetch members');
    }

    // Fetch profiles separately
    const userIds = (members || []).map(m => m.user_id);
    const { data: profiles } = userIds.length > 0
      ? await adminClient.from('profiles').select('user_id, email, full_name').in('user_id', userIds)
      : { data: [] };

    // Create a map of user_id -> profile
    const profileMap = new Map<string, { email: string; full_name: string }>();
    for (const p of profiles || []) {
      profileMap.set(p.user_id, { email: p.email, full_name: p.full_name });
    }

    // Get required documents for each role
    const { data: requiredDocs } = await adminClient
      .from('hospital_required_documents')
      .select('doc_id, required_for_role')
      .eq('hospital_id', hospitalId);

    const managerDocsRequired = (requiredDocs || [])
      .filter(d => d.required_for_role === 'HOSPITAL_MANAGER')
      .map(d => d.doc_id);
    const doctorDocsRequired = (requiredDocs || [])
      .filter(d => d.required_for_role === 'DOCTOR')
      .map(d => d.doc_id);

    // Get all acceptances for this hospital
    const { data: acceptances } = userIds.length > 0
      ? await adminClient
          .from('document_acceptances')
          .select('user_id, doc_id')
          .eq('hospital_id', hospitalId)
          .in('user_id', userIds)
      : { data: [] };

    // Create a map of user_id -> Set of accepted doc_ids
    const acceptanceMap = new Map<string, Set<string>>();
    for (const acc of acceptances || []) {
      if (!acceptanceMap.has(acc.user_id)) {
        acceptanceMap.set(acc.user_id, new Set());
      }
      acceptanceMap.get(acc.user_id)!.add(acc.doc_id);
    }

    // Get user auth info to check if they've logged in
    const { data: authUsers } = await adminClient.auth.admin.listUsers();
    const authUserMap = new Map<string, any>();
    for (const u of authUsers?.users || []) {
      authUserMap.set(u.id, u);
    }

    return (members || []).map(m => {
      const requiredDocs = m.role === 'HOSPITAL_MANAGER' ? managerDocsRequired : doctorDocsRequired;
      const acceptedDocs = acceptanceMap.get(m.user_id) || new Set();
      const allDocsSigned = requiredDocs.length === 0 || requiredDocs.every(docId => acceptedDocs.has(docId));

      const authUser = authUserMap.get(m.user_id);
      const hasLoggedIn = !!authUser?.last_sign_in_at;
      const profile = profileMap.get(m.user_id);

      // Determine compliance status
      let complianceStatus: 'compliant' | 'pending_signatures' | 'not_logged_in' = 'compliant';
      if (!hasLoggedIn) {
        complianceStatus = 'not_logged_in';
      } else if (!allDocsSigned) {
        complianceStatus = 'pending_signatures';
      }

      return {
        id: m.id,
        userId: m.user_id,
        email: profile?.email,
        fullName: profile?.full_name,
        role: m.role,
        isPrimary: m.is_primary,
        status: m.status,
        createdAt: m.created_at,
        complianceStatus,
        hasLoggedIn,
        documentsRequired: requiredDocs.length,
        documentsSigned: acceptedDocs.size,
      };
    });
  }

  async updateHospitalMember(
    hospitalId: string,
    memberId: string,
    updates: { isPrimary?: boolean },
    userId: string,
    accessToken: string,
  ) {
    const supabase = this.supabaseService.getClientWithToken(accessToken);

    // Verify user is super admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', userId)
      .single();

    if (!profile?.is_super_admin) {
      throw new ForbiddenException('Only super admins can update hospital members');
    }

    const updateData: any = {};
    if (updates.isPrimary !== undefined) {
      updateData.is_primary = updates.isPrimary;

      // If setting as primary, unset other primaries for this hospital and role
      if (updates.isPrimary) {
        // Get the member's role first
        const { data: member } = await supabase
          .from('hospital_memberships')
          .select('role')
          .eq('id', memberId)
          .single();

        if (member) {
          await supabase
            .from('hospital_memberships')
            .update({ is_primary: false })
            .eq('hospital_id', hospitalId)
            .eq('role', member.role)
            .neq('id', memberId);
        }
      }
    }

    const { data: updatedMember, error } = await supabase
      .from('hospital_memberships')
      .update(updateData)
      .eq('id', memberId)
      .eq('hospital_id', hospitalId)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update member: ${error.message}`);
      throw new BadRequestException('Failed to update member');
    }

    return {
      id: updatedMember.id,
      userId: updatedMember.user_id,
      role: updatedMember.role,
      isPrimary: updatedMember.is_primary,
      status: updatedMember.status,
    };
  }

  async removeHospitalMember(
    hospitalId: string,
    memberId: string,
    userId: string,
    accessToken: string,
  ) {
    const supabase = this.supabaseService.getClientWithToken(accessToken);

    // Verify user is super admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', userId)
      .single();

    if (!profile?.is_super_admin) {
      throw new ForbiddenException('Only super admins can remove hospital members');
    }

    // Check if this is a primary manager - don't allow removal
    const { data: member } = await supabase
      .from('hospital_memberships')
      .select('is_primary, role')
      .eq('id', memberId)
      .eq('hospital_id', hospitalId)
      .single();

    if (member?.is_primary && member?.role === 'HOSPITAL_MANAGER') {
      throw new BadRequestException('Cannot remove primary manager. Assign a new primary manager first.');
    }

    // Soft delete by setting status to INACTIVE
    const { error } = await supabase
      .from('hospital_memberships')
      .update({ status: 'INACTIVE' })
      .eq('id', memberId)
      .eq('hospital_id', hospitalId);

    if (error) {
      this.logger.error(`Failed to remove member: ${error.message}`);
      throw new BadRequestException('Failed to remove member');
    }

    return { success: true };
  }

  private mapToDto(hospital: any): HospitalResponseDto {
    return {
      id: hospital.id,
      name: hospital.name,
      addressLine1: hospital.address_line1,
      addressLine2: hospital.address_line2,
      city: hospital.city,
      state: hospital.state,
      postal: hospital.postal,
      country: hospital.country,
      region: hospital.region,
      currency: hospital.currency,
      timezone: hospital.timezone,
      status: hospital.status,
      phone: hospital.phone,
      email: hospital.email,
      website: hospital.website,
      logoUrl: hospital.logo_url,
      pictureUrl: hospital.picture_url,
      createdAt: hospital.created_at,
      updatedAt: hospital.updated_at,
    };
  }
}
