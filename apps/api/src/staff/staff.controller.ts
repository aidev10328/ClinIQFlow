import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { StaffService } from './staff.service';
import { SupabaseGuard, AuthenticatedRequest } from '../supabase/supabase.guard';
import { CreateStaffDto, UpdateStaffDto, ResetPasswordDto } from './dto/staff.dto';

@Controller('v1/staff')
@UseGuards(SupabaseGuard)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  /**
   * Create a staff account (HOSPITAL_MANAGER only)
   * Staff are created with email/password - no email verification
   * POST /v1/staff
   */
  @Post()
  async createStaff(
    @Body() dto: CreateStaffDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    return this.staffService.createStaff(
      dto,
      hospitalId,
      req.user.id,
      req.accessToken,
    );
  }

  /**
   * Get staff for current hospital (from x-hospital-id header)
   * GET /v1/staff
   */
  @Get()
  async getStaff(@Req() req: AuthenticatedRequest) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }
    return this.staffService.getHospitalStaff(hospitalId, req.accessToken, req.scopingContext);
  }

  /**
   * Get all staff for a specific hospital
   * GET /v1/staff/hospital/:hospitalId
   */
  @Get('hospital/:hospitalId')
  async getHospitalStaff(
    @Param('hospitalId') hospitalId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.staffService.getHospitalStaff(hospitalId, req.accessToken, req.scopingContext);
  }

  /**
   * Update a staff member (HOSPITAL_MANAGER only)
   * PATCH /v1/staff/:staffId
   */
  @Patch(':staffId')
  async updateStaff(
    @Param('staffId') staffId: string,
    @Body() dto: UpdateStaffDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    return this.staffService.updateStaff(
      staffId,
      dto,
      hospitalId,
      req.user.id,
      req.accessToken,
    );
  }

  /**
   * Reset a staff member's password (HOSPITAL_MANAGER only)
   * POST /v1/staff/:staffId/reset-password
   */
  @Post(':staffId/reset-password')
  async resetPassword(
    @Param('staffId') staffId: string,
    @Body() dto: ResetPasswordDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    return this.staffService.resetPassword(
      staffId,
      dto.newPassword,
      hospitalId,
      req.user.id,
      req.accessToken,
    );
  }

  /**
   * Delete a staff member (HOSPITAL_MANAGER only)
   * DELETE /v1/staff/:staffId
   */
  @Delete(':staffId')
  async deleteStaff(
    @Param('staffId') staffId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    return this.staffService.deleteStaff(
      staffId,
      hospitalId,
      req.user.id,
      req.accessToken,
    );
  }
}
