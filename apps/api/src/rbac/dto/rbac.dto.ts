import { IsString, IsOptional, IsArray, IsObject, IsUUID } from 'class-validator';

// =============================================
// Response DTOs
// =============================================

export class ResourceDto {
  id: string;
  code: string;
  name: string;
  description?: string;
  category: string;
  pathPattern?: string;
  parentCode?: string;
  sortOrder: number;
  isActive: boolean;
}

export class ResourceActionDto {
  id: string;
  resourceId: string;
  action: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export class ResourceFieldDto {
  id: string;
  resourceId: string;
  fieldCode: string;
  fieldName: string;
  fieldType: string;
  description?: string;
  isActive: boolean;
}

export class ResourceWithActionsDto extends ResourceDto {
  actions: ResourceActionDto[];
  fields: ResourceFieldDto[];
}

export class RolePermissionDto {
  id: string;
  role: string;
  resourceId: string;
  resourceCode: string;
  resourceName: string;
  allowedActions: string[];
  fieldPermissions: {
    viewable: string[];
    editable: string[];
  };
}

export class HospitalRoleOverrideDto {
  id: string;
  hospitalId: string;
  hospitalName?: string;
  role: string;
  resourceId: string;
  resourceCode: string;
  allowedActions: string[];
  fieldPermissions: {
    viewable: string[];
    editable: string[];
  };
}

export class UserPermissionsDto {
  role: string | null;
  isSuperAdmin: boolean;
  hospitalId: string | null;
  permissions: ResolvedPermissionDto[];
}

export class ResolvedPermissionDto {
  resourceCode: string;
  resourceName: string;
  category: string;
  allowedActions: string[];
  fieldPermissions: {
    viewable: string[];
    editable: string[];
  };
}

// =============================================
// Request DTOs
// =============================================

export class UpdateRolePermissionsDto {
  @IsUUID()
  resourceId: string;

  @IsArray()
  @IsString({ each: true })
  allowedActions: string[];

  @IsOptional()
  @IsObject()
  fieldPermissions?: {
    viewable: string[];
    editable: string[];
  };
}

export class SetHospitalOverrideDto {
  @IsUUID()
  resourceId: string;

  @IsArray()
  @IsString({ each: true })
  allowedActions: string[];

  @IsOptional()
  @IsObject()
  fieldPermissions?: {
    viewable: string[];
    editable: string[];
  };
}

export class CheckPermissionDto {
  @IsString()
  resourceCode: string;

  @IsString()
  action: string;

  @IsOptional()
  @IsString()
  field?: string;
}

export class CheckPermissionResponseDto {
  allowed: boolean;
  reason?: string;
}

export class BulkUpdateRolePermissionsDto {
  @IsArray()
  permissions: UpdateRolePermissionsDto[];
}
