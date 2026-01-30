import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  ScopingRuleDto,
  UpdateScopingRuleDto,
  DataScopingContext,
  SCOPING_ROLES,
  DATA_DOMAINS,
  SCOPE_TYPES,
} from './dto/data-scoping.dto';

interface CacheEntry {
  data: any;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class DataScopingService {
  private readonly logger = new Logger(DataScopingService.name);
  private cache = new Map<string, CacheEntry>();

  constructor(private supabaseService: SupabaseService) {}

  // =============================================
  // Cache helpers (same pattern as RbacService)
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
    this.cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
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
  // CRUD — Scoping Rules
  // =============================================

  async getAllRules(): Promise<ScopingRuleDto[]> {
    const cached = this.getCached<ScopingRuleDto[]>('all-rules');
    if (cached) return cached;

    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) throw new BadRequestException('Database not available');

    const { data, error } = await adminClient
      .from('data_scoping_rules')
      .select('*')
      .eq('is_active', true)
      .order('role')
      .order('data_domain');

    if (error) {
      this.logger.error('Failed to fetch scoping rules', error);
      throw new BadRequestException('Failed to fetch scoping rules');
    }

    const rules = (data || []).map(this.mapRule);
    this.setCache('all-rules', rules);
    return rules;
  }

  async getRulesForRole(role: string): Promise<ScopingRuleDto[]> {
    const cacheKey = `rules:${role}`;
    const cached = this.getCached<ScopingRuleDto[]>(cacheKey);
    if (cached) return cached;

    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) throw new BadRequestException('Database not available');

    const { data, error } = await adminClient
      .from('data_scoping_rules')
      .select('*')
      .eq('role', role)
      .eq('is_active', true)
      .order('data_domain');

    if (error) {
      this.logger.error(`Failed to fetch rules for role ${role}`, error);
      throw new BadRequestException('Failed to fetch scoping rules');
    }

    const rules = (data || []).map(this.mapRule);
    this.setCache(cacheKey, rules);
    return rules;
  }

  async updateRule(dto: UpdateScopingRuleDto, userId: string, accessToken: string): Promise<ScopingRuleDto> {
    await this.verifySuperAdmin(userId);
    this.validateScopeType(dto.dataDomain, dto.scopeType);

    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) throw new BadRequestException('Database not available');

    const { data, error } = await adminClient
      .from('data_scoping_rules')
      .upsert(
        {
          role: dto.role,
          data_domain: dto.dataDomain,
          scope_type: dto.scopeType,
          description: dto.description || null,
        },
        { onConflict: 'role,data_domain' },
      )
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to update scoping rule', error);
      throw new BadRequestException('Failed to update scoping rule');
    }

    this.invalidateCache();
    return this.mapRule(data);
  }

  async bulkUpdateRules(
    dtos: UpdateScopingRuleDto[],
    userId: string,
    accessToken: string,
  ): Promise<{ success: boolean; updated: number }> {
    await this.verifySuperAdmin(userId);

    for (const dto of dtos) {
      this.validateScopeType(dto.dataDomain, dto.scopeType);
    }

    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) throw new BadRequestException('Database not available');

    let updated = 0;
    for (const dto of dtos) {
      const { error } = await adminClient
        .from('data_scoping_rules')
        .upsert(
          {
            role: dto.role,
            data_domain: dto.dataDomain,
            scope_type: dto.scopeType,
            description: dto.description || null,
          },
          { onConflict: 'role,data_domain' },
        );

      if (!error) updated++;
    }

    this.invalidateCache();
    return { success: true, updated };
  }

  // =============================================
  // Context Resolution
  // =============================================

  async resolveContext(userId: string, hospitalId: string): Promise<DataScopingContext> {
    const cacheKey = `context:${userId}:${hospitalId}`;
    const cached = this.getCached<DataScopingContext>(cacheKey);
    if (cached) return cached;

    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      return this.buildEmptyContext();
    }

    // 1. Check if super admin
    const { data: profile } = await adminClient
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', userId)
      .single();

    const isSuperAdmin = !!profile?.is_super_admin;

    // 2. Get membership: role + assigned_doctor_ids
    const { data: membership } = await adminClient
      .from('hospital_memberships')
      .select('role, assigned_doctor_ids')
      .eq('hospital_id', hospitalId)
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .single();

    const role = membership?.role || null;
    const assignedDoctorIds: string[] | null = membership?.assigned_doctor_ids || null;

    // 3. Check if user is a doctor (get their doctor profile)
    const { data: doctorProfile } = await adminClient
      .from('doctor_profiles')
      .select('id, user_id')
      .eq('hospital_id', hospitalId)
      .eq('user_id', userId)
      .single();

    const doctorUserId = doctorProfile ? doctorProfile.user_id : null;
    const doctorProfileId = doctorProfile ? doctorProfile.id : null;

    // 4. Check if user is a patient
    const { data: patientRecord } = await adminClient
      .from('patients')
      .select('id')
      .eq('hospital_id', hospitalId)
      .eq('email', profile ? undefined : undefined) // Patient lookup by email requires joining profiles
      .limit(1);
    // For now, patientId lookup is deferred — patients table may not have user_id column
    const patientId: string | null = null;

    // 5. Super admin bypass
    if (isSuperAdmin) {
      const allDoctors = await this.getAllHospitalDoctors(adminClient, hospitalId);
      const context: DataScopingContext = {
        role: role || 'SUPER_ADMIN',
        isSuperAdmin: true,
        doctorUserId,
        doctorProfileId,
        assignedDoctorIds,
        patientId,
        visibleDoctorUserIds: allDoctors.map((d) => d.userId),
        visibleDoctorProfileIds: allDoctors.map((d) => d.profileId),
        rules: this.buildAllAccessRules(),
      };
      this.setCache(cacheKey, context);
      return context;
    }

    // 6. Get scoping rules for this role
    const rules = role ? await this.getRulesForRole(role) : [];
    const ruleMap: Record<string, string> = {};
    for (const r of rules) {
      ruleMap[r.dataDomain] = r.scopeType;
    }

    // 7. Resolve visible doctor IDs based on 'doctors' domain scope
    const doctorsScope = ruleMap['doctors'] || 'none';
    let visibleDoctors: { userId: string; profileId: string }[] = [];

    switch (doctorsScope) {
      case 'all_hospital':
        visibleDoctors = await this.getAllHospitalDoctors(adminClient, hospitalId);
        break;
      case 'self_only':
        if (doctorProfileId && doctorUserId) {
          visibleDoctors = [{ userId: doctorUserId, profileId: doctorProfileId }];
        }
        break;
      case 'assigned_only':
        if (assignedDoctorIds && assignedDoctorIds.length > 0) {
          visibleDoctors = await this.getDoctorsByUserIds(adminClient, hospitalId, assignedDoctorIds);
        }
        break;
      case 'none':
      default:
        visibleDoctors = [];
        break;
    }

    const context: DataScopingContext = {
      role,
      isSuperAdmin: false,
      doctorUserId,
      doctorProfileId,
      assignedDoctorIds,
      patientId,
      visibleDoctorUserIds: visibleDoctors.map((d) => d.userId),
      visibleDoctorProfileIds: visibleDoctors.map((d) => d.profileId),
      rules: ruleMap,
    };

    this.setCache(cacheKey, context);
    return context;
  }

  // =============================================
  // Helpers
  // =============================================

  private async getAllHospitalDoctors(
    adminClient: any,
    hospitalId: string,
  ): Promise<{ userId: string; profileId: string }[]> {
    const cacheKey = `doctors:${hospitalId}`;
    const cached = this.getCached<{ userId: string; profileId: string }[]>(cacheKey);
    if (cached) return cached;

    const { data } = await adminClient
      .from('doctor_profiles')
      .select('id, user_id')
      .eq('hospital_id', hospitalId);

    const result = (data || []).map((d: any) => ({ userId: d.user_id, profileId: d.id }));
    this.setCache(cacheKey, result);
    return result;
  }

  private async getDoctorsByUserIds(
    adminClient: any,
    hospitalId: string,
    userIds: string[],
  ): Promise<{ userId: string; profileId: string }[]> {
    const { data } = await adminClient
      .from('doctor_profiles')
      .select('id, user_id')
      .eq('hospital_id', hospitalId)
      .in('user_id', userIds);

    return (data || []).map((d: any) => ({ userId: d.user_id, profileId: d.id }));
  }

  private async verifySuperAdmin(userId: string): Promise<void> {
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) throw new ForbiddenException('Not authorized');

    const { data: profile } = await adminClient
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', userId)
      .single();

    if (!profile?.is_super_admin) {
      throw new ForbiddenException('Only super admins can modify data scoping rules');
    }
  }

  private validateScopeType(dataDomain: string, scopeType: string): void {
    const validTypes = SCOPE_TYPES[dataDomain];
    if (!validTypes) {
      throw new BadRequestException(`Invalid data domain: ${dataDomain}. Valid domains: ${DATA_DOMAINS.join(', ')}`);
    }
    if (!validTypes.includes(scopeType)) {
      throw new BadRequestException(
        `Invalid scope type "${scopeType}" for domain "${dataDomain}". Valid: ${validTypes.join(', ')}`,
      );
    }
  }

  private buildAllAccessRules(): Record<string, string> {
    return {
      doctors: 'all_hospital',
      patients: 'all_hospital',
      appointments: 'all_hospital',
      schedule: 'all_hospital',
      metrics: 'hospital_wide',
      staff: 'all_hospital',
    };
  }

  private buildEmptyContext(): DataScopingContext {
    return {
      role: null,
      isSuperAdmin: false,
      doctorUserId: null,
      doctorProfileId: null,
      assignedDoctorIds: null,
      patientId: null,
      visibleDoctorUserIds: [],
      visibleDoctorProfileIds: [],
      rules: {},
    };
  }

  private mapRule(row: any): ScopingRuleDto {
    return {
      id: row.id,
      role: row.role,
      dataDomain: row.data_domain,
      scopeType: row.scope_type,
      description: row.description || null,
      isActive: row.is_active,
    };
  }
}
