import { IsString, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

// Valid roles for data scoping
export const SCOPING_ROLES = [
  'HOSPITAL_MANAGER', 'DOCTOR', 'HOSPITAL_STAFF', 'PATIENT',
  'SALES_MANAGER', 'SALES_PERSONNEL',
  'CUSTOMER_SERVICE_MANAGER', 'CUSTOMER_SERVICE_PERSONNEL',
] as const;
export type ScopingRole = (typeof SCOPING_ROLES)[number];

// Valid data domains
export const DATA_DOMAINS = ['doctors', 'patients', 'appointments', 'schedule', 'metrics', 'staff'] as const;
export type DataDomain = (typeof DATA_DOMAINS)[number];

// Valid scope types per domain
export const SCOPE_TYPES: Record<string, string[]> = {
  doctors: ['all_hospital', 'self_only', 'assigned_only', 'none'],
  patients: ['all_hospital', 'by_doctor_scope', 'self_record', 'none'],
  appointments: ['all_hospital', 'by_doctor_scope', 'self_only', 'none'],
  schedule: ['all_hospital', 'by_doctor_scope', 'self_only', 'none'],
  metrics: ['hospital_wide', 'by_doctor_scope', 'self_only', 'none'],
  staff: ['all_hospital', 'same_doctors', 'none'],
};

// Human-readable labels for scope types
export const SCOPE_LABELS: Record<string, string> = {
  all_hospital: 'All Hospital',
  self_only: 'Self Only',
  assigned_only: 'Assigned Doctors Only',
  by_doctor_scope: 'By Doctor Scope',
  self_record: 'Own Record Only',
  same_doctors: 'Same Doctors',
  hospital_wide: 'Hospital Wide',
  none: 'No Access',
};

export class ScopingRuleDto {
  id: string;
  role: string;
  dataDomain: string;
  scopeType: string;
  description: string | null;
  isActive: boolean;
}

export class UpdateScopingRuleDto {
  @IsString()
  role: string;

  @IsString()
  dataDomain: string;

  @IsString()
  scopeType: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class BulkUpdateScopingRulesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateScopingRuleDto)
  rules: UpdateScopingRuleDto[];
}

// The resolved scoping context attached to every request
export interface DataScopingContext {
  role: string | null;
  isSuperAdmin: boolean;
  doctorUserId: string | null;
  doctorProfileId: string | null;
  assignedDoctorIds: string[] | null;
  patientId: string | null;
  visibleDoctorUserIds: string[];
  visibleDoctorProfileIds: string[];
  rules: Record<string, string>;
}
