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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SupabaseGuard, AuthenticatedRequest } from '../supabase/supabase.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { ImportService } from './import.service';

@Controller('v1/admin')
@UseGuards(SupabaseGuard)
export class AdminController {
  constructor(
    private supabaseService: SupabaseService,
    private importService: ImportService,
  ) {}

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

  // ============ Appointment Reasons ============

  @Get('appointment-reasons')
  async listAppointmentReasons(@Req() req: AuthenticatedRequest) {
    const profile = await this.supabaseService.getUserProfile(
      req.accessToken,
      req.originalUser?.id || req.user.id,
    );
    if (!profile?.is_super_admin) {
      throw new ForbiddenException('Only super admins can manage appointment reasons');
    }

    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) throw new ForbiddenException('Admin access not available');

    const { data, error } = await adminClient
      .from('appointment_reasons')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw new Error('Failed to fetch appointment reasons');
    return data || [];
  }

  @Post('appointment-reasons')
  async createAppointmentReason(
    @Req() req: AuthenticatedRequest,
    @Body() body: { name: string; description?: string; sortOrder?: number },
  ) {
    const profile = await this.supabaseService.getUserProfile(
      req.accessToken,
      req.originalUser?.id || req.user.id,
    );
    if (!profile?.is_super_admin) {
      throw new ForbiddenException('Only super admins can manage appointment reasons');
    }
    if (!body.name?.trim()) {
      throw new BadRequestException('Reason name is required');
    }

    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) throw new ForbiddenException('Admin access not available');

    const { data, error } = await adminClient
      .from('appointment_reasons')
      .insert({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        sort_order: body.sortOrder || 0,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException('An appointment reason with this name already exists');
      }
      throw new Error('Failed to create appointment reason');
    }
    return data;
  }

  @Patch('appointment-reasons/:id')
  async updateAppointmentReason(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; sortOrder?: number; isActive?: boolean },
  ) {
    const profile = await this.supabaseService.getUserProfile(
      req.accessToken,
      req.originalUser?.id || req.user.id,
    );
    if (!profile?.is_super_admin) {
      throw new ForbiddenException('Only super admins can manage appointment reasons');
    }

    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) throw new ForbiddenException('Admin access not available');

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.description !== undefined) updateData.description = body.description?.trim() || null;
    if (body.sortOrder !== undefined) updateData.sort_order = body.sortOrder;
    if (body.isActive !== undefined) updateData.is_active = body.isActive;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const { data, error } = await adminClient
      .from('appointment_reasons')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException('An appointment reason with this name already exists');
      }
      throw new Error('Failed to update appointment reason');
    }
    return data;
  }

  @Delete('appointment-reasons/:id')
  async deleteAppointmentReason(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const profile = await this.supabaseService.getUserProfile(
      req.accessToken,
      req.originalUser?.id || req.user.id,
    );
    if (!profile?.is_super_admin) {
      throw new ForbiddenException('Only super admins can manage appointment reasons');
    }

    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) throw new ForbiddenException('Admin access not available');

    const { error } = await adminClient
      .from('appointment_reasons')
      .delete()
      .eq('id', id);

    if (error) throw new Error('Failed to delete appointment reason');
    return { success: true };
  }

  // ============ Data Import ============

  private async verifySuperAdmin(req: AuthenticatedRequest) {
    const profile = await this.supabaseService.getUserProfile(
      req.accessToken,
      req.originalUser?.id || req.user.id,
    );
    if (!profile?.is_super_admin) {
      throw new ForbiddenException('Only super admins can use data import');
    }
    return profile;
  }

  @Post('import/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.verifySuperAdmin(req);

    if (!file) throw new BadRequestException('No file uploaded');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('File too large. Max 10MB.');

    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/octet-stream',
    ];
    if (!allowedMimes.includes(file.mimetype) && !file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      throw new BadRequestException('Invalid file type. Upload .xlsx, .xls, or .csv');
    }

    return this.importService.parseExcelFile(file.buffer);
  }

  @Get('import/columns')
  async getImportColumns(
    @Req() req: AuthenticatedRequest,
    @Query('entityType') entityType: string,
  ) {
    await this.verifySuperAdmin(req);
    return this.importService.getColumns(entityType);
  }

  @Post('import/patients')
  async importPatients(
    @Req() req: AuthenticatedRequest,
    @Body() body: { fileId: string; hospitalId: string; mapping: Record<string, string>; saveMappingAs?: string },
  ) {
    await this.verifySuperAdmin(req);

    if (!body.fileId || !body.hospitalId || !body.mapping) {
      throw new BadRequestException('fileId, hospitalId, and mapping are required');
    }

    const result = await this.importService.importPatients(body.hospitalId, body.fileId, body.mapping);

    // Save mapping if requested
    if (body.saveMappingAs?.trim()) {
      try {
        await this.importService.saveMapping(
          body.hospitalId,
          'patients',
          body.saveMappingAs.trim(),
          body.mapping,
          req.user.id,
        );
        (result as any).mappingSaved = true;
      } catch {
        (result as any).mappingSaved = false;
      }
    }

    return result;
  }

  @Post('import/doctors')
  async importDoctors(
    @Req() req: AuthenticatedRequest,
    @Body() body: { fileId: string; hospitalId: string; mapping: Record<string, string>; defaultPassword?: string; saveMappingAs?: string },
  ) {
    await this.verifySuperAdmin(req);

    if (!body.fileId || !body.hospitalId || !body.mapping) {
      throw new BadRequestException('fileId, hospitalId, and mapping are required');
    }

    const result = await this.importService.importDoctors(body.hospitalId, body.fileId, body.mapping, body.defaultPassword);

    if (body.saveMappingAs?.trim()) {
      try {
        await this.importService.saveMapping(
          body.hospitalId,
          'doctors',
          body.saveMappingAs.trim(),
          body.mapping,
          req.user.id,
        );
        (result as any).mappingSaved = true;
      } catch {
        (result as any).mappingSaved = false;
      }
    }

    return result;
  }

  @Get('import/mappings')
  async listMappings(
    @Req() req: AuthenticatedRequest,
    @Query('hospitalId') hospitalId: string,
    @Query('entityType') entityType?: string,
  ) {
    await this.verifySuperAdmin(req);
    if (!hospitalId) throw new BadRequestException('hospitalId is required');
    return this.importService.getMappings(hospitalId, entityType);
  }

  @Post('import/mappings')
  async createMapping(
    @Req() req: AuthenticatedRequest,
    @Body() body: { hospitalId: string; entityType: string; name: string; mappingJson: Record<string, string> },
  ) {
    await this.verifySuperAdmin(req);
    if (!body.hospitalId || !body.entityType || !body.name || !body.mappingJson) {
      throw new BadRequestException('hospitalId, entityType, name, and mappingJson are required');
    }
    return this.importService.saveMapping(body.hospitalId, body.entityType, body.name, body.mappingJson, req.user.id);
  }

  @Patch('import/mappings/:id')
  async updateMapping(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { name?: string; mappingJson?: Record<string, string> },
  ) {
    await this.verifySuperAdmin(req);
    return this.importService.updateMapping(id, body);
  }

  @Delete('import/mappings/:id')
  async deleteMapping(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.verifySuperAdmin(req);
    return this.importService.deleteMapping(id);
  }
}
