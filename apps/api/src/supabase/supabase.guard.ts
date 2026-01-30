import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { DataScopingContext } from '../data-scoping/dto/data-scoping.dto';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
  };
  accessToken: string;
  hospitalId?: string;
  scopingContext?: DataScopingContext | null;
  // Impersonation fields
  isImpersonating?: boolean;
  originalUser?: {
    id: string;
    email: string;
  };
  impersonatedUser?: {
    id: string;
    email: string;
    fullName?: string;
    role?: string;
  };
}

@Injectable()
export class SupabaseGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseGuard.name);

  constructor(private supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);
    const user = this.supabaseService.verifyToken(token);

    if (!user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Also reject if user ID is empty (e.g., anon tokens)
    if (!user.id) {
      this.logger.warn('Token has no user ID (sub claim)');
      throw new UnauthorizedException('Authentication required');
    }

    // Attach user and token to request
    request.user = {
      id: user.id,
      email: user.email,
    };
    request.accessToken = token;

    // Extract hospital ID from header if present
    const hospitalId = request.headers['x-hospital-id'];
    if (hospitalId) {
      request.hospitalId = hospitalId;
    }

    // Check for impersonation
    const impersonateUserId = request.headers['x-impersonate-user-id'];
    if (impersonateUserId) {
      await this.handleImpersonation(request, user.id, impersonateUserId, token);
    }

    return true;
  }

  private async handleImpersonation(
    request: any,
    originalUserId: string,
    impersonateUserId: string,
    accessToken: string,
  ): Promise<void> {
    // Verify the caller is a super admin
    const profile = await this.supabaseService.getUserProfile(accessToken, originalUserId);

    if (!profile?.is_super_admin) {
      this.logger.warn(`Non-super-admin user ${originalUserId} attempted to impersonate ${impersonateUserId}`);
      throw new ForbiddenException('Only super admins can impersonate users');
    }

    // Get the impersonated user's profile
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new ForbiddenException('Impersonation not available');
    }

    const { data: impersonatedProfile, error } = await adminClient
      .from('profiles')
      .select('user_id, email, full_name')
      .eq('user_id', impersonateUserId)
      .single();

    if (error || !impersonatedProfile) {
      this.logger.warn(`Failed to find user to impersonate: ${impersonateUserId}`);
      throw new ForbiddenException('User not found');
    }

    // Get the impersonated user's role in the current hospital
    let role: string | undefined;
    if (request.hospitalId) {
      const { data: membership } = await adminClient
        .from('hospital_memberships')
        .select('role')
        .eq('user_id', impersonateUserId)
        .eq('hospital_id', request.hospitalId)
        .eq('status', 'ACTIVE')
        .single();

      role = membership?.role;
    }

    this.logger.log(
      `Super admin ${originalUserId} impersonating user ${impersonateUserId} (${impersonatedProfile.email})`,
    );

    // Store original user and set impersonated user
    request.originalUser = {
      id: originalUserId,
      email: request.user.email,
    };
    request.isImpersonating = true;
    request.impersonatedUser = {
      id: impersonatedProfile.user_id,
      email: impersonatedProfile.email,
      fullName: impersonatedProfile.full_name,
      role,
    };

    // Replace the current user with the impersonated user
    request.user = {
      id: impersonatedProfile.user_id,
      email: impersonatedProfile.email,
    };
  }
}
