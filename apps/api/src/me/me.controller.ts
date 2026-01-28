import { Controller, Get, Patch, Body, UseGuards, Req, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { SupabaseGuard, AuthenticatedRequest } from '../supabase/supabase.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { PrismaService } from '../prisma.service';
import { ProductsService } from '../products/products.service';
import { UserEntitlementsDto } from '../products/dto/products.dto';
import { IsOptional, IsString } from 'class-validator';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

@Controller('v1/me')
@UseGuards(SupabaseGuard)
export class MeController {
  constructor(
    private supabaseService: SupabaseService,
    private prisma: PrismaService,
    private productsService: ProductsService,
  ) {}

  @Get()
  async getMe(@Req() req: AuthenticatedRequest) {
    const accessToken = req.accessToken;
    const isImpersonating = req.isImpersonating || false;

    console.log('[MeController] ===== /v1/me called =====');
    console.log('[MeController] User from token:', { email: req.user.email, id: req.user.id });
    if (isImpersonating) {
      console.log('[MeController] Impersonating user:', req.impersonatedUser);
    }

    // Fetch profile - try Supabase first, fall back to Prisma
    let profile = await this.supabaseService.getUserProfile(accessToken, req.user.id);
    let prismaUser: any = null;

    if (!profile) {
      // Supabase not available - fall back to Prisma user lookup
      console.log('[MeController] Supabase profile not available, falling back to Prisma');
      prismaUser = await this.prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
      });
      if (prismaUser) {
        profile = {
          user_id: prismaUser.id,
          email: prismaUser.email,
          full_name: [prismaUser.firstName, prismaUser.lastName].filter(Boolean).join(' ') || null,
          phone: null,
          is_super_admin: prismaUser.role === 'ADMIN',
        };
      }
    }

    console.log('[MeController] Profile result:', profile ? {
      email: profile.email,
      is_super_admin: profile.is_super_admin
    } : 'null');

    // When impersonating, use the impersonated user's super admin status
    const isSuperAdmin = isImpersonating ? false : (profile?.is_super_admin || false);
    let hospitals: any[] = [];

    if (this.supabaseService.isSupabaseConfigured) {
      // Supabase mode - fetch hospitals from Supabase
      if (isSuperAdmin && !isImpersonating) {
        console.log('[MeController] User is super admin, fetching all hospitals');
        const allHospitals = await this.supabaseService.getAllHospitals();
        hospitals = allHospitals.map((h: any) => ({
          id: h.id,
          name: h.name,
          city: h.city,
          state: h.state,
          country: h.country,
          region: h.region,
          currency: h.currency,
          timezone: h.timezone,
          role: 'SUPER_ADMIN',
          isPrimary: false,
        }));
        console.log('[MeController] All hospitals count:', hospitals.length);
      } else {
        const adminClient = this.supabaseService.getAdminClient();
        if (adminClient && isImpersonating) {
          const { data: memberships } = await adminClient
            .from('hospital_memberships')
            .select(`
              id,
              role,
              is_primary,
              status,
              hospital:hospitals (
                id,
                name,
                city,
                state,
                country,
                region,
                currency,
                timezone,
                status
              )
            `)
            .eq('user_id', req.user.id)
            .eq('status', 'ACTIVE');

          hospitals = (memberships || []).map((m: any) => ({
            id: m.hospital?.id,
            name: m.hospital?.name,
            city: m.hospital?.city,
            state: m.hospital?.state,
            country: m.hospital?.country,
            region: m.hospital?.region,
            currency: m.hospital?.currency,
            timezone: m.hospital?.timezone,
            role: m.role,
            isPrimary: m.is_primary,
          })).filter((h: any) => h.id);
        } else {
          const memberships = await this.supabaseService.getUserMemberships(accessToken, req.user.id);
          console.log('[MeController] Memberships count:', memberships.length);

          hospitals = memberships.map((m: any) => ({
            id: m.hospital?.id,
            name: m.hospital?.name,
            city: m.hospital?.city,
            state: m.hospital?.state,
            country: m.hospital?.country,
            region: m.hospital?.region,
            currency: m.hospital?.currency,
            timezone: m.hospital?.timezone,
            role: m.role,
            isPrimary: m.is_primary,
          })).filter((h: any) => h.id);
        }
      }
    } else {
      // No Supabase - hospitals not available via Prisma (no hospital model yet)
      console.log('[MeController] No Supabase configured, skipping hospital lookup');
    }

    // Get entitlements for current hospital if specified
    let entitlements: UserEntitlementsDto | null = null;
    if (req.hospitalId) {
      try {
        entitlements = await this.productsService.getUserEntitlements(
          req.user.id,
          req.hospitalId,
        );
      } catch (e) {
        // Silently fail - user might not have any subscriptions yet
        console.log('[MeController] No entitlements found:', e.message);
      }
    }

    const response: any = {
      user: {
        id: req.user.id,
        email: req.user.email,
        fullName: profile?.full_name,
        phone: profile?.phone,
        isSuperAdmin,
      },
      hospitals,
      currentHospitalId: req.hospitalId || null,
      entitlements,
    };

    // Add impersonation info if impersonating
    if (isImpersonating) {
      response.impersonation = {
        isImpersonating: true,
        impersonatedUser: req.impersonatedUser,
        originalUser: req.originalUser,
      };
    }

    return response;
  }

  @Patch()
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ) {
    console.log('[MeController] PATCH /v1/me called');
    console.log('[MeController] User ID:', req.user.id);
    console.log('[MeController] DTO received:', dto);

    const updateData: any = {};
    if (dto.fullName !== undefined) updateData.full_name = dto.fullName;
    if (dto.phone !== undefined) updateData.phone = dto.phone;

    console.log('[MeController] Update data:', updateData);

    // Use admin client to bypass RLS for profile updates
    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      console.error('[MeController] Admin client not available');
      throw new InternalServerErrorException('Admin client not available');
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const { data: profile, error } = await adminClient
      .from('profiles')
      .update(updateData)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) {
      console.error('[MeController] Profile update error:', error);
      console.error('[MeController] Error details:', JSON.stringify(error, null, 2));
      throw new InternalServerErrorException(`Failed to update profile: ${error.message}`);
    }

    console.log('[MeController] Profile updated successfully:', profile);

    return {
      id: profile.user_id,
      email: profile.email,
      fullName: profile.full_name,
      phone: profile.phone,
    };
  }
}
