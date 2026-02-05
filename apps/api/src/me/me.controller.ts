import { Controller, Get, Patch, Body, UseGuards, Req, InternalServerErrorException, BadRequestException, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(MeController.name);

  constructor(
    private supabaseService: SupabaseService,
    private prisma: PrismaService,
    private productsService: ProductsService,
  ) {}

  @Get()
  async getMe(@Req() req: AuthenticatedRequest) {
    const accessToken = req.accessToken;
    const isImpersonating = req.isImpersonating || false;

    // Fetch profile - try Supabase first, fall back to Prisma
    let profile = await this.supabaseService.getUserProfile(accessToken, req.user.id);

    if (!profile) {
      const prismaUser = await this.prisma.user.findUnique({
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

    const isSuperAdmin = isImpersonating ? false : (profile?.is_super_admin || false);

    // Fetch hospitals and entitlements in parallel
    const mapMembership = (m: any) => ({
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
      logoUrl: m.hospital?.logo_url || null,
    });

    const hospitalsPromise = (async (): Promise<any[]> => {
      if (!this.supabaseService.isSupabaseConfigured) return [];

      if (isSuperAdmin && !isImpersonating) {
        const allHospitals = await this.supabaseService.getAllHospitals();
        return allHospitals.map((h: any) => ({
          id: h.id, name: h.name, city: h.city, state: h.state,
          country: h.country, region: h.region, currency: h.currency,
          timezone: h.timezone, role: 'SUPER_ADMIN', isPrimary: false,
          logoUrl: h.logo_url || null,
        }));
      }

      const adminClient = this.supabaseService.getAdminClient();
      if (adminClient && isImpersonating) {
        const { data: memberships } = await adminClient
          .from('hospital_memberships')
          .select(`
            id, role, is_primary, status,
            hospital:hospitals (id, name, city, state, country, region, currency, timezone, status, logo_url)
          `)
          .eq('user_id', req.user.id)
          .eq('status', 'ACTIVE');
        return (memberships || []).map(mapMembership).filter((h: any) => h.id);
      }

      const memberships = await this.supabaseService.getUserMemberships(accessToken, req.user.id);
      return memberships.map(mapMembership).filter((h: any) => h.id);
    })();

    const entitlementsPromise = (async (): Promise<UserEntitlementsDto | null> => {
      if (!req.hospitalId) return null;
      try {
        return await this.productsService.getUserEntitlements(req.user.id, req.hospitalId);
      } catch (e) {
        return null;
      }
    })();

    const [hospitals, entitlements] = await Promise.all([hospitalsPromise, entitlementsPromise]);

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
    const updateData: any = {};
    if (dto.fullName !== undefined) updateData.full_name = dto.fullName;
    if (dto.phone !== undefined) updateData.phone = dto.phone;

    const adminClient = this.supabaseService.getAdminClient();
    if (!adminClient) {
      throw new InternalServerErrorException('Admin client not available');
    }

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
      this.logger.error(`Profile update error: ${error.message}`);
      throw new InternalServerErrorException(`Failed to update profile: ${error.message}`);
    }

    return {
      id: profile.user_id,
      email: profile.email,
      fullName: profile.full_name,
      phone: profile.phone,
    };
  }
}
