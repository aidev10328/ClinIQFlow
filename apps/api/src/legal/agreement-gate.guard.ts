import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LegalService } from './legal.service';
import { AuthenticatedRequest } from '../supabase/supabase.guard';

// Decorator to skip agreement check for specific routes
export const SKIP_AGREEMENT_CHECK = 'skipAgreementCheck';
export const SkipAgreementCheck = () => {
  return (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) => {
    if (propertyKey && descriptor) {
      // Method decorator
      Reflect.defineMetadata(SKIP_AGREEMENT_CHECK, true, descriptor.value);
    } else {
      // Class decorator
      Reflect.defineMetadata(SKIP_AGREEMENT_CHECK, true, target);
    }
    return descriptor || target;
  };
};

/**
 * Guard that enforces legal agreement acceptance before accessing protected routes.
 *
 * This guard should be applied AFTER the SupabaseGuard (which authenticates the user).
 *
 * Routes that are automatically allowed (not gated):
 * - Routes with @SkipAgreementCheck() decorator
 * - Routes without hospital context (no x-hospital-id header)
 * - Health check and auth routes
 * - Legal module routes (to allow viewing and accepting documents)
 * - Invite acceptance routes
 *
 * When a user has pending agreements:
 * - Returns 403 with code "AGREEMENT_REQUIRED" and redirect "/legal/accept"
 */
@Injectable()
export class AgreementGateGuard implements CanActivate {
  private readonly logger = new Logger(AgreementGateGuard.name);

  // Routes that should never be gated (even with hospital context)
  private readonly allowedPaths = [
    '/v1/health',
    '/v1/ready',
    '/v1/auth',
    '/v1/me',
    '/v1/legal',
    '/v1/invites/lookup',
    '/v1/invites/accept',
    '/v1/invites/signup-and-accept',
    '/v1/queue/public',
    '/v1/appointments/public',
    '/debug',
  ];

  constructor(
    private readonly reflector: Reflector,
    private readonly legalService: LegalService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const path = request.url?.split('?')[0] || '';

    // Check if route has @SkipAgreementCheck decorator
    const skipCheck = this.reflector.getAllAndOverride<boolean>(SKIP_AGREEMENT_CHECK, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipCheck) {
      return true;
    }

    // Check if path is in allowed list
    const isAllowedPath = this.allowedPaths.some(allowed => path.startsWith(allowed));
    if (isAllowedPath) {
      return true;
    }

    // If no hospital context, skip gating (user might be selecting hospital)
    const hospitalId = request.hospitalId;
    if (!hospitalId) {
      return true;
    }

    // If no user (not authenticated), let other guards handle it
    if (!request.user?.id) {
      return true;
    }

    try {
      // Check if user has pending requirements for this hospital
      const hasPending = await this.legalService.hasPendingRequirements(
        request.user.id,
        hospitalId,
        request.accessToken,
      );

      if (hasPending) {
        this.logger.log(`User ${request.user.id} has pending agreements for hospital ${hospitalId}`);
        throw new ForbiddenException({
          code: 'AGREEMENT_REQUIRED',
          message: 'You must accept required agreements before accessing this resource',
          redirect: '/legal/accept',
        });
      }

      return true;
    } catch (error) {
      // Re-throw ForbiddenException
      if (error instanceof ForbiddenException) {
        throw error;
      }

      // Log other errors but don't block (fail open for now)
      this.logger.error(`Error checking agreements: ${error.message}`);
      return true;
    }
  }
}
