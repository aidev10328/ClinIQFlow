import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from './rbac.service';

// Decorator metadata key
export const RBAC_PERMISSION_KEY = 'rbac_permission';

// Decorator for requiring permissions
export interface RbacPermissionOptions {
  resource: string;
  action: string;
  field?: string;
}

export const RequirePermission = (resource: string, action: string, field?: string) =>
  SetMetadata(RBAC_PERMISSION_KEY, { resource, action, field } as RbacPermissionOptions);

@Injectable()
export class RbacGuard implements CanActivate {
  private readonly logger = new Logger(RbacGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get the required permission from decorator
    const permission = this.reflector.get<RbacPermissionOptions>(
      RBAC_PERMISSION_KEY,
      context.getHandler(),
    );

    // If no @RequirePermission decorator, allow access
    if (!permission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    const accessToken = request.accessToken;
    const hospitalId = request.hospitalId || null;

    if (!userId || !accessToken) {
      throw new ForbiddenException('Authentication required');
    }

    // Check permission
    const result = await this.rbacService.checkPermission(
      userId,
      hospitalId,
      permission.resource,
      permission.action,
      accessToken,
      permission.field,
    );

    if (!result.allowed) {
      this.logger.warn(
        `Permission denied for user ${userId}: ${permission.resource}:${permission.action} - ${result.reason}`,
      );
      throw new ForbiddenException(result.reason || 'Permission denied');
    }

    return true;
  }
}
