import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Body,
  Param,
  UseGuards,
  Req,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseGuard, AuthenticatedRequest } from '../supabase/supabase.guard';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('v1/admin')
@UseGuards(SupabaseGuard)
export class AdminController {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * List users that can be impersonated
   * Query params:
   * - hospitalId: Filter by hospital membership
   * - role: Filter by role (HOSPITAL_MANAGER, DOCTOR)
   * - search: Search by email or name
   */
  @Get('users')
  async listUsers(
    @Req() req: AuthenticatedRequest,
    @Query('hospitalId') hospitalId?: string,
    @Query('role') role?: string,
    @Query('search') search?: string,
  ) {
    // Verify super admin
    const profile = await this.supabaseService.getUserProfile(
      req.accessToken,
      req.originalUser?.id || req.user.id,
    );

    if (!profile?.is_super_admin) {
      throw new ForbiddenException('Only super admins can list users');
    }

    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new ForbiddenException('Admin access not available');
    }

    // If hospitalId is provided, get users with memberships in that hospital
    if (hospitalId) {
      let query = adminClient
        .from('hospital_memberships')
        .select(`
          id,
          role,
          user_id,
          profiles!inner (
            user_id,
            email,
            full_name
          )
        `)
        .eq('hospital_id', hospitalId)
        .eq('status', 'ACTIVE');

      if (role) {
        query = query.eq('role', role);
      }

      const { data: memberships, error } = await query;

      if (error) {
        throw new Error('Failed to fetch users');
      }

      let users = (memberships || []).map((m: any) => ({
        id: m.user_id,
        email: m.profiles?.email,
        fullName: m.profiles?.full_name,
        role: m.role,
        hospitalId,
      }));

      // Apply search filter
      if (search) {
        const searchLower = search.toLowerCase();
        users = users.filter(
          (u) =>
            u.email?.toLowerCase().includes(searchLower) ||
            u.fullName?.toLowerCase().includes(searchLower),
        );
      }

      return users;
    }

    // No hospital filter - return all users (with optional search)
    let query = adminClient.from('profiles').select('user_id, email, full_name');

    const { data: profiles, error } = await query;

    if (error) {
      throw new Error('Failed to fetch users');
    }

    let users = (profiles || []).map((p) => ({
      id: p.user_id,
      email: p.email,
      fullName: p.full_name,
      role: null,
      hospitalId: null,
    }));

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      users = users.filter(
        (u) =>
          u.email?.toLowerCase().includes(searchLower) ||
          u.fullName?.toLowerCase().includes(searchLower),
      );
    }

    return users.slice(0, 50); // Limit results
  }

  /**
   * Get hospitals for impersonation selection
   */
  @Get('hospitals')
  async listHospitals(@Req() req: AuthenticatedRequest) {
    // Verify super admin
    const profile = await this.supabaseService.getUserProfile(
      req.accessToken,
      req.originalUser?.id || req.user.id,
    );

    if (!profile?.is_super_admin) {
      throw new ForbiddenException('Only super admins can list hospitals');
    }

    const hospitals = await this.supabaseService.getAllHospitals();

    return hospitals.map((h: any) => ({
      id: h.id,
      name: h.name,
      city: h.city,
      state: h.state,
      country: h.country,
      region: h.region,
    }));
  }

  /**
   * Get all specializations (for super admin management)
   */
  @Get('specializations')
  async listSpecializations(@Req() req: AuthenticatedRequest) {
    // Verify super admin
    const profile = await this.supabaseService.getUserProfile(
      req.accessToken,
      req.originalUser?.id || req.user.id,
    );

    if (!profile?.is_super_admin) {
      throw new ForbiddenException('Only super admins can manage specializations');
    }

    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new ForbiddenException('Admin access not available');
    }

    const { data, error } = await adminClient
      .from('specializations')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      throw new Error('Failed to fetch specializations');
    }

    return data || [];
  }

  /**
   * Create a new specialization
   */
  @Post('specializations')
  async createSpecialization(
    @Req() req: AuthenticatedRequest,
    @Body() body: { name: string; description?: string; sortOrder?: number },
  ) {
    // Verify super admin
    const profile = await this.supabaseService.getUserProfile(
      req.accessToken,
      req.originalUser?.id || req.user.id,
    );

    if (!profile?.is_super_admin) {
      throw new ForbiddenException('Only super admins can manage specializations');
    }

    if (!body.name?.trim()) {
      throw new BadRequestException('Specialization name is required');
    }

    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new ForbiddenException('Admin access not available');
    }

    const { data, error } = await adminClient
      .from('specializations')
      .insert({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        sort_order: body.sortOrder || 0,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException('A specialization with this name already exists');
      }
      throw new Error('Failed to create specialization');
    }

    return data;
  }

  /**
   * Update a specialization
   */
  @Patch('specializations/:id')
  async updateSpecialization(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; sortOrder?: number; isActive?: boolean },
  ) {
    // Verify super admin
    const profile = await this.supabaseService.getUserProfile(
      req.accessToken,
      req.originalUser?.id || req.user.id,
    );

    if (!profile?.is_super_admin) {
      throw new ForbiddenException('Only super admins can manage specializations');
    }

    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new ForbiddenException('Admin access not available');
    }

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.description !== undefined) updateData.description = body.description?.trim() || null;
    if (body.sortOrder !== undefined) updateData.sort_order = body.sortOrder;
    if (body.isActive !== undefined) updateData.is_active = body.isActive;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const { data, error } = await adminClient
      .from('specializations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException('A specialization with this name already exists');
      }
      throw new Error('Failed to update specialization');
    }

    return data;
  }

  /**
   * Delete a specialization
   */
  @Delete('specializations/:id')
  async deleteSpecialization(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    // Verify super admin
    const profile = await this.supabaseService.getUserProfile(
      req.accessToken,
      req.originalUser?.id || req.user.id,
    );

    if (!profile?.is_super_admin) {
      throw new ForbiddenException('Only super admins can manage specializations');
    }

    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new ForbiddenException('Admin access not available');
    }

    // Check if specialization is in use
    const { data: usageCount } = await adminClient
      .from('doctor_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('specialization_id', id);

    if (usageCount && usageCount.length > 0) {
      throw new BadRequestException('Cannot delete specialization that is in use by doctors');
    }

    const { error } = await adminClient
      .from('specializations')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error('Failed to delete specialization');
    }

    return { success: true };
  }
}
