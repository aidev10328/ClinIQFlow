import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { InvitesService } from './invites.service';
import { SupabaseGuard, AuthenticatedRequest } from '../supabase/supabase.guard';
import {
  CreateManagerInviteDto,
  CreateDoctorInviteDto,
  AcceptInviteDto,
} from './dto/invite.dto';

@Controller('v1/invites')
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  /**
   * Create a manager invite (SUPER_ADMIN only)
   */
  @Post('create-manager')
  @UseGuards(SupabaseGuard)
  async createManagerInvite(
    @Body() dto: CreateManagerInviteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.invitesService.createManagerInvite(
      dto,
      req.user.id,
      req.accessToken,
    );
  }

  /**
   * Create a doctor invite (HOSPITAL_MANAGER only)
   * Uses x-hospital-id header for hospital context
   */
  @Post('create-doctor')
  @UseGuards(SupabaseGuard)
  async createDoctorInvite(
    @Body() dto: CreateDoctorInviteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    return this.invitesService.createDoctorInvite(
      dto,
      hospitalId,
      req.user.id,
      req.accessToken,
    );
  }

  /**
   * Lookup invite by token (public - returns minimal info)
   */
  @Get('lookup')
  async lookupInvite(@Query('token') token: string) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    return this.invitesService.lookupInvite(token);
  }

  /**
   * Accept an invite (authenticated user)
   */
  @Post('accept')
  @UseGuards(SupabaseGuard)
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.invitesService.acceptInvite(
      dto.token,
      req.user.id,
      req.user.email,
      req.accessToken,
    );
  }

  /**
   * Signup and accept invite in one step (public endpoint)
   * Creates user with admin API (auto-confirmed) and accepts invite
   */
  @Post('signup-and-accept')
  async signupAndAccept(
    @Body() dto: { token: string; email: string; password: string; displayName?: string },
  ) {
    return this.invitesService.signupAndAcceptInvite(
      dto.token,
      dto.email,
      dto.password,
      dto.displayName,
    );
  }

  /**
   * Get pending invites for current hospital (from x-hospital-id header)
   */
  @Get('pending')
  @UseGuards(SupabaseGuard)
  async getPendingInvites(@Req() req: AuthenticatedRequest) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }
    return this.invitesService.getHospitalInvites(hospitalId, req.accessToken);
  }

  /**
   * Get invites for a specific hospital (MANAGER or SUPER_ADMIN)
   * Super admins can view invites for any hospital
   */
  @Get('hospital/:hospitalId')
  @UseGuards(SupabaseGuard)
  async getHospitalInvites(
    @Param('hospitalId') hospitalId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.invitesService.getHospitalInvitesForAdmin(
      hospitalId,
      req.user.id,
      req.accessToken,
    );
  }

  /**
   * Resend an invite
   * Super admins can resend any invite
   * Hospital managers can resend doctor invites for their hospital
   */
  @Post(':inviteId/resend')
  @UseGuards(SupabaseGuard)
  async resendInvite(
    @Param('inviteId') inviteId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.invitesService.resendInvite(
      inviteId,
      req.user.id,
      req.accessToken,
      req.hospitalId, // Pass hospital context for manager permission checks
    );
  }

  /**
   * Revoke a pending invite
   */
  @Delete(':inviteId')
  @UseGuards(SupabaseGuard)
  async revokeInvite(
    @Param('inviteId') inviteId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    await this.invitesService.revokeInvite(inviteId, hospitalId, req.accessToken);
    return { success: true };
  }
}
