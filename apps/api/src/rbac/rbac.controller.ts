import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { SupabaseGuard, AuthenticatedRequest } from '../supabase/supabase.guard';
import { RbacService } from './rbac.service';
import {
  ResourceWithActionsDto,
  RolePermissionDto,
  HospitalRoleOverrideDto,
  UserPermissionsDto,
  UpdateRolePermissionsDto,
  SetHospitalOverrideDto,
  CheckPermissionDto,
  CheckPermissionResponseDto,
  BulkUpdateRolePermissionsDto,
} from './dto/rbac.dto';

@Controller('v1/rbac')
@UseGuards(SupabaseGuard)
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  // =============================================
  // Resources
  // =============================================

  @Get('resources')
  async getResources(@Req() req: AuthenticatedRequest): Promise<ResourceWithActionsDto[]> {
    return this.rbacService.getResources(req.accessToken);
  }

  @Get('resources/tree')
  async getResourcesTree(@Req() req: AuthenticatedRequest) {
    return this.rbacService.getResourcesTree(req.accessToken);
  }

  // =============================================
  // Roles
  // =============================================

  @Get('roles')
  async getRoles(): Promise<{ role: string; name: string; isSystem: boolean }[]> {
    return this.rbacService.getRoles();
  }

  @Get('roles/:role/permissions')
  async getRolePermissions(
    @Param('role') role: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<RolePermissionDto[]> {
    return this.rbacService.getRolePermissions(role, req.accessToken);
  }

  @Put('roles/:role/permissions')
  async updateRolePermission(
    @Param('role') role: string,
    @Body() dto: UpdateRolePermissionsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RolePermissionDto> {
    return this.rbacService.updateRolePermission(
      role,
      dto,
      req.user.id,
      req.accessToken,
    );
  }

  @Put('roles/:role/permissions/bulk')
  async bulkUpdateRolePermissions(
    @Param('role') role: string,
    @Body() dto: BulkUpdateRolePermissionsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; updated: number }> {
    return this.rbacService.bulkUpdateRolePermissions(
      role,
      dto.permissions,
      req.user.id,
      req.accessToken,
    );
  }

  // =============================================
  // Hospital Overrides
  // =============================================

  @Get('hospitals/:hospitalId/overrides')
  async getHospitalOverrides(
    @Param('hospitalId') hospitalId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<HospitalRoleOverrideDto[]> {
    return this.rbacService.getHospitalOverrides(hospitalId, req.accessToken);
  }

  @Put('hospitals/:hospitalId/roles/:role')
  async setHospitalOverride(
    @Param('hospitalId') hospitalId: string,
    @Param('role') role: string,
    @Body() dto: SetHospitalOverrideDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<HospitalRoleOverrideDto> {
    return this.rbacService.setHospitalOverride(
      hospitalId,
      role,
      dto,
      req.user.id,
      req.accessToken,
    );
  }

  @Delete('hospitals/:hospitalId/overrides/:overrideId')
  async deleteHospitalOverride(
    @Param('hospitalId') hospitalId: string,
    @Param('overrideId') overrideId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    return this.rbacService.deleteHospitalOverride(
      hospitalId,
      overrideId,
      req.user.id,
      req.accessToken,
    );
  }

  // =============================================
  // User Permissions
  // =============================================

  @Get('my-permissions')
  async getMyPermissions(
    @Req() req: AuthenticatedRequest,
  ): Promise<UserPermissionsDto> {
    return this.rbacService.getUserPermissions(
      req.user.id,
      req.hospitalId || null,
      req.accessToken,
    );
  }

  @Post('check')
  async checkPermission(
    @Body() dto: CheckPermissionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CheckPermissionResponseDto> {
    return this.rbacService.checkPermission(
      req.user.id,
      req.hospitalId || null,
      dto.resourceCode,
      dto.action,
      req.accessToken,
      dto.field,
    );
  }
}
