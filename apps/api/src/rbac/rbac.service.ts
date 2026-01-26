import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  ResourceWithActionsDto,
  RolePermissionDto,
  HospitalRoleOverrideDto,
  UserPermissionsDto,
  ResolvedPermissionDto,
  UpdateRolePermissionsDto,
  SetHospitalOverrideDto,
} from './dto/rbac.dto';

// In-memory cache for permissions
interface CacheEntry {
  data: any;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);
  private cache = new Map<string, CacheEntry>();

  constructor(private supabaseService: SupabaseService) {}

  // =============================================
  // Cache helpers
  // =============================================

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  private invalidateCache(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  // =============================================
  // Resources
  // =============================================

  async getResources(accessToken: string): Promise<ResourceWithActionsDto[]> {
    const cached = this.getCached<ResourceWithActionsDto[]>('resources');
    if (cached) return cached;

    const supabase = this.supabaseService.getClientWithToken(accessToken);

    // Fetch resources
    const { data: resources, error: resourcesError } = await supabase
      .from('rbac_resources')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (resourcesError) {
      this.logger.error(`Failed to fetch resources: ${resourcesError.message}`);
      throw new BadRequestException('Failed to fetch resources');
    }

    // Fetch actions
    const { data: actions } = await supabase
      .from('rbac_resource_actions')
      .select('*')
      .eq('is_active', true);

    // Fetch fields
    const { data: fields } = await supabase
      .from('rbac_resource_fields')
      .select('*')
      .eq('is_active', true);

    const result = (resources || []).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      category: r.category,
      pathPattern: r.path_pattern,
      parentCode: r.parent_code,
      sortOrder: r.sort_order,
      isActive: r.is_active,
      actions: (actions || [])
        .filter((a) => a.resource_id === r.id)
        .map((a) => ({
          id: a.id,
          resourceId: a.resource_id,
          action: a.action,
          name: a.name,
          description: a.description,
          isActive: a.is_active,
        })),
      fields: (fields || [])
        .filter((f) => f.resource_id === r.id)
        .map((f) => ({
          id: f.id,
          resourceId: f.resource_id,
          fieldCode: f.field_code,
          fieldName: f.field_name,
          fieldType: f.field_type,
          description: f.description,
          isActive: f.is_active,
        })),
    }));

    this.setCache('resources', result);
    return result;
  }

  // =============================================
  // Role Permissions
  // =============================================

  async getRolePermissions(role: string, accessToken: string): Promise<RolePermissionDto[]> {
    const cacheKey = `role_permissions:${role}`;
    const cached = this.getCached<RolePermissionDto[]>(cacheKey);
    if (cached) return cached;

    const supabase = this.supabaseService.getClientWithToken(accessToken);

    const { data: permissions, error } = await supabase
      .from('rbac_role_permissions')
      .select(`
        id,
        role,
        resource_id,
        allowed_actions,
        field_permissions,
        rbac_resources!inner (
          code,
          name
        )
      `)
      .eq('role', role);

    if (error) {
      this.logger.error(`Failed to fetch role permissions: ${error.message}`);
      throw new BadRequestException('Failed to fetch role permissions');
    }

    const result = (permissions || []).map((p: any) => ({
      id: p.id,
      role: p.role,
      resourceId: p.resource_id,
      resourceCode: p.rbac_resources?.code || '',
      resourceName: p.rbac_resources?.name || '',
      allowedActions: p.allowed_actions || [],
      fieldPermissions: p.field_permissions || { viewable: [], editable: [] },
    }));

    this.setCache(cacheKey, result);
    return result;
  }

  async updateRolePermission(
    role: string,
    dto: UpdateRolePermissionsDto,
    userId: string,
    accessToken: string,
  ): Promise<RolePermissionDto> {
    const supabase = this.supabaseService.getClientWithToken(accessToken);

    // Verify super admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', userId)
      .single();

    if (!profile?.is_super_admin) {
      throw new BadRequestException('Only super admins can update role permissions');
    }

    // Don't allow modifying SUPER_ADMIN role
    if (role === 'SUPER_ADMIN') {
      throw new BadRequestException('Cannot modify SUPER_ADMIN permissions');
    }

    const { data: updated, error } = await supabase
      .from('rbac_role_permissions')
      .upsert(
        {
          role,
          resource_id: dto.resourceId,
          allowed_actions: dto.allowedActions,
          field_permissions: dto.fieldPermissions || { viewable: [], editable: [] },
        },
        {
          onConflict: 'role,resource_id',
        },
      )
      .select(`
        id,
        role,
        resource_id,
        allowed_actions,
        field_permissions,
        rbac_resources!inner (
          code,
          name
        )
      `)
      .single();

    if (error) {
      this.logger.error(`Failed to update role permission: ${error.message}`);
      throw new BadRequestException('Failed to update role permission');
    }

    // Invalidate cache
    this.invalidateCache(`role_permissions:${role}`);
    this.invalidateCache('user_permissions');

    return {
      id: updated.id,
      role: updated.role,
      resourceId: updated.resource_id,
      resourceCode: (updated as any).rbac_resources?.code || '',
      resourceName: (updated as any).rbac_resources?.name || '',
      allowedActions: updated.allowed_actions || [],
      fieldPermissions: updated.field_permissions as any || { viewable: [], editable: [] },
    };
  }

  async bulkUpdateRolePermissions(
    role: string,
    permissions: UpdateRolePermissionsDto[],
    userId: string,
    accessToken: string,
  ): Promise<{ success: boolean; updated: number }> {
    let updated = 0;
    for (const perm of permissions) {
      await this.updateRolePermission(role, perm, userId, accessToken);
      updated++;
    }
    return { success: true, updated };
  }

  // =============================================
  // Hospital Overrides
  // =============================================

  async getHospitalOverrides(
    hospitalId: string,
    accessToken: string,
  ): Promise<HospitalRoleOverrideDto[]> {
    const supabase = this.supabaseService.getClientWithToken(accessToken);

    const { data: overrides, error } = await supabase
      .from('rbac_hospital_role_overrides')
      .select(`
        id,
        hospital_id,
        role,
        resource_id,
        allowed_actions,
        field_permissions,
        rbac_resources!inner (
          code
        ),
        hospitals!inner (
          name
        )
      `)
      .eq('hospital_id', hospitalId);

    if (error) {
      this.logger.error(`Failed to fetch hospital overrides: ${error.message}`);
      throw new BadRequestException('Failed to fetch hospital overrides');
    }

    return (overrides || []).map((o: any) => ({
      id: o.id,
      hospitalId: o.hospital_id,
      hospitalName: o.hospitals?.name,
      role: o.role,
      resourceId: o.resource_id,
      resourceCode: o.rbac_resources?.code || '',
      allowedActions: o.allowed_actions || [],
      fieldPermissions: o.field_permissions || { viewable: [], editable: [] },
    }));
  }

  async setHospitalOverride(
    hospitalId: string,
    role: string,
    dto: SetHospitalOverrideDto,
    userId: string,
    accessToken: string,
  ): Promise<HospitalRoleOverrideDto> {
    const supabase = this.supabaseService.getClientWithToken(accessToken);

    // Verify super admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', userId)
      .single();

    if (!profile?.is_super_admin) {
      throw new BadRequestException('Only super admins can set hospital overrides');
    }

    const { data: override, error } = await supabase
      .from('rbac_hospital_role_overrides')
      .upsert(
        {
          hospital_id: hospitalId,
          role,
          resource_id: dto.resourceId,
          allowed_actions: dto.allowedActions,
          field_permissions: dto.fieldPermissions || { viewable: [], editable: [] },
        },
        {
          onConflict: 'hospital_id,role,resource_id',
        },
      )
      .select(`
        id,
        hospital_id,
        role,
        resource_id,
        allowed_actions,
        field_permissions,
        rbac_resources!inner (
          code
        )
      `)
      .single();

    if (error) {
      this.logger.error(`Failed to set hospital override: ${error.message}`);
      throw new BadRequestException('Failed to set hospital override');
    }

    // Invalidate cache
    this.invalidateCache(`hospital_overrides:${hospitalId}`);
    this.invalidateCache('user_permissions');

    return {
      id: override.id,
      hospitalId: override.hospital_id,
      role: override.role,
      resourceId: override.resource_id,
      resourceCode: (override as any).rbac_resources?.code || '',
      allowedActions: override.allowed_actions || [],
      fieldPermissions: override.field_permissions as any || { viewable: [], editable: [] },
    };
  }

  async deleteHospitalOverride(
    hospitalId: string,
    overrideId: string,
    userId: string,
    accessToken: string,
  ): Promise<{ success: boolean }> {
    const supabase = this.supabaseService.getClientWithToken(accessToken);

    // Verify super admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', userId)
      .single();

    if (!profile?.is_super_admin) {
      throw new BadRequestException('Only super admins can delete hospital overrides');
    }

    const { error } = await supabase
      .from('rbac_hospital_role_overrides')
      .delete()
      .eq('id', overrideId)
      .eq('hospital_id', hospitalId);

    if (error) {
      throw new BadRequestException('Failed to delete hospital override');
    }

    this.invalidateCache(`hospital_overrides:${hospitalId}`);
    this.invalidateCache('user_permissions');

    return { success: true };
  }

  // =============================================
  // User Permissions Resolution
  // =============================================

  async getUserPermissions(
    userId: string,
    hospitalId: string | null,
    accessToken: string,
  ): Promise<UserPermissionsDto> {
    const cacheKey = `user_permissions:${userId}:${hospitalId || 'global'}`;
    const cached = this.getCached<UserPermissionsDto>(cacheKey);
    if (cached) return cached;

    const supabase = this.supabaseService.getClientWithToken(accessToken);

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', userId)
      .single();

    const isSuperAdmin = profile?.is_super_admin || false;

    // Get user role for hospital
    let role: string | null = null;
    if (hospitalId && !isSuperAdmin) {
      const { data: membership } = await supabase
        .from('hospital_memberships')
        .select('role')
        .eq('user_id', userId)
        .eq('hospital_id', hospitalId)
        .eq('status', 'ACTIVE')
        .single();

      role = membership?.role || null;
    }

    // Super admin gets all permissions
    if (isSuperAdmin) {
      const resources = await this.getResources(accessToken);
      const result: UserPermissionsDto = {
        role: 'SUPER_ADMIN',
        isSuperAdmin: true,
        hospitalId,
        permissions: resources.map((r) => ({
          resourceCode: r.code,
          resourceName: r.name,
          category: r.category,
          allowedActions: ['view', 'add', 'edit', 'delete'],
          fieldPermissions: { viewable: ['*'], editable: ['*'] },
        })),
      };
      this.setCache(cacheKey, result);
      return result;
    }

    // No role = no permissions
    if (!role) {
      return {
        role: null,
        isSuperAdmin: false,
        hospitalId,
        permissions: [],
      };
    }

    // Get resources
    const resources = await this.getResources(accessToken);

    // Get role default permissions
    const { data: rolePermissions } = await supabase
      .from('rbac_role_permissions')
      .select('resource_id, allowed_actions, field_permissions')
      .eq('role', role);

    // Get hospital overrides
    let hospitalOverrides: any[] = [];
    if (hospitalId) {
      const { data } = await supabase
        .from('rbac_hospital_role_overrides')
        .select('resource_id, allowed_actions, field_permissions')
        .eq('hospital_id', hospitalId)
        .eq('role', role);
      hospitalOverrides = data || [];
    }

    // Get user-specific overrides
    const { data: userOverrides } = await supabase
      .from('rbac_user_permissions')
      .select('resource_id, allowed_actions, denied_actions, field_permissions')
      .eq('user_id', userId)
      .or(`hospital_id.eq.${hospitalId},hospital_id.is.null`);

    // Create lookup maps
    const rolePermMap = new Map(
      (rolePermissions || []).map((p) => [p.resource_id, p]),
    );
    const hospitalOverrideMap = new Map(
      (hospitalOverrides || []).map((o) => [o.resource_id, o]),
    );
    const userOverrideMap = new Map(
      (userOverrides || []).map((u) => [u.resource_id, u]),
    );

    // Resolve permissions for each resource
    const permissions: ResolvedPermissionDto[] = [];

    for (const resource of resources) {
      // Only include hospital resources for hospital context
      if (resource.category === 'admin' && !isSuperAdmin) {
        continue;
      }

      const rolePerm = rolePermMap.get(resource.id);
      const hospitalOverride = hospitalOverrideMap.get(resource.id);
      const userOverride = userOverrideMap.get(resource.id);

      // Resolution order: User Override > Hospital Override > Role Default
      let allowedActions: string[] = [];
      let fieldPermissions = { viewable: [] as string[], editable: [] as string[] };

      if (userOverride) {
        // User override takes precedence
        allowedActions = (userOverride.allowed_actions || []).filter(
          (a: string) => !(userOverride.denied_actions || []).includes(a),
        );
        fieldPermissions = userOverride.field_permissions || fieldPermissions;
      } else if (hospitalOverride) {
        // Hospital override
        allowedActions = hospitalOverride.allowed_actions || [];
        fieldPermissions = hospitalOverride.field_permissions || fieldPermissions;
      } else if (rolePerm) {
        // Role default
        allowedActions = rolePerm.allowed_actions || [];
        fieldPermissions = rolePerm.field_permissions || fieldPermissions;
      }

      // Apply user denied actions even if using hospital/role permissions
      if (userOverride?.denied_actions?.length) {
        allowedActions = allowedActions.filter(
          (a) => !userOverride.denied_actions.includes(a),
        );
      }

      // Only include resources with at least view permission
      if (allowedActions.includes('view') || allowedActions.length > 0) {
        permissions.push({
          resourceCode: resource.code,
          resourceName: resource.name,
          category: resource.category,
          allowedActions,
          fieldPermissions,
        });
      }
    }

    const result: UserPermissionsDto = {
      role,
      isSuperAdmin: false,
      hospitalId,
      permissions,
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // =============================================
  // Permission Check
  // =============================================

  async checkPermission(
    userId: string,
    hospitalId: string | null,
    resourceCode: string,
    action: string,
    accessToken: string,
    field?: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const userPermissions = await this.getUserPermissions(userId, hospitalId, accessToken);

    // Super admin bypass
    if (userPermissions.isSuperAdmin) {
      return { allowed: true, reason: 'Super admin bypass' };
    }

    // Find resource permission
    const resourcePerm = userPermissions.permissions.find(
      (p) => p.resourceCode === resourceCode,
    );

    if (!resourcePerm) {
      return { allowed: false, reason: 'No permission for this resource' };
    }

    // Check action
    if (!resourcePerm.allowedActions.includes(action)) {
      return { allowed: false, reason: `Action '${action}' not allowed` };
    }

    // Check field if specified
    if (field) {
      const isViewAction = action === 'view';
      const fieldList = isViewAction
        ? resourcePerm.fieldPermissions.viewable
        : resourcePerm.fieldPermissions.editable;

      // Check for wildcard or specific field
      if (!fieldList.includes('*') && !fieldList.includes(field)) {
        return { allowed: false, reason: `Field '${field}' not accessible` };
      }
    }

    return { allowed: true };
  }

  // =============================================
  // Roles List
  // =============================================

  async getRoles(): Promise<{ role: string; name: string; isSystem: boolean }[]> {
    // Return system roles
    return [
      { role: 'SUPER_ADMIN', name: 'Super Admin', isSystem: true },
      { role: 'HOSPITAL_MANAGER', name: 'Hospital Manager', isSystem: true },
      { role: 'DOCTOR', name: 'Doctor', isSystem: true },
    ];
  }
}
