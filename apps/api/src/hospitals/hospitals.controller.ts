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
import { HospitalsService } from './hospitals.service';
import { SupabaseGuard, AuthenticatedRequest } from '../supabase/supabase.guard';
import { CreateHospitalDto, UpdateHospitalDto } from './dto/hospital.dto';

@Controller('v1/hospitals')
@UseGuards(SupabaseGuard)
export class HospitalsController {
  constructor(private readonly hospitalsService: HospitalsService) {}

  /**
   * Create a hospital (SUPER_ADMIN only)
   */
  @Post()
  async createHospital(
    @Body() dto: CreateHospitalDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.hospitalsService.createHospital(
      dto,
      req.user.id,
      req.accessToken,
    );
  }

  /**
   * Get all hospitals (filtered by RLS - super admin sees all, others see their hospitals)
   */
  @Get()
  async getAllHospitals(@Req() req: AuthenticatedRequest) {
    return this.hospitalsService.getAllHospitals(req.accessToken);
  }

  /**
   * Get members for current hospital with compliance status (from x-hospital-id header)
   * Returns enhanced member info including whether they've logged in and signed documents
   * NOTE: This route MUST come before :hospitalId routes to avoid being matched as a parameter
   */
  @Get('members/compliance')
  async getCurrentHospitalMembersWithCompliance(@Req() req: AuthenticatedRequest) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }
    return this.hospitalsService.getHospitalMembersWithCompliance(hospitalId);
  }

  /**
   * Get members for current hospital (from x-hospital-id header)
   * NOTE: This route MUST come before :hospitalId routes to avoid being matched as a parameter
   */
  @Get('members')
  async getCurrentHospitalMembers(@Req() req: AuthenticatedRequest) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }
    return this.hospitalsService.getHospitalMembers(hospitalId, req.accessToken);
  }

  /**
   * Get a specific hospital
   */
  @Get(':hospitalId')
  async getHospital(
    @Param('hospitalId') hospitalId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.hospitalsService.getHospital(hospitalId, req.accessToken);
  }

  /**
   * Update a hospital (SUPER_ADMIN only)
   */
  @Patch(':hospitalId')
  async updateHospital(
    @Param('hospitalId') hospitalId: string,
    @Body() dto: UpdateHospitalDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.hospitalsService.updateHospital(
      hospitalId,
      dto,
      req.user.id,
      req.accessToken,
    );
  }

  /**
   * Get hospital members with compliance status (SUPER_ADMIN only)
   * Returns enhanced member info including whether they've logged in and signed documents
   * Note: This route must come before :hospitalId/members to avoid route conflict
   */
  @Get(':hospitalId/members/compliance')
  async getHospitalMembersWithCompliance(
    @Param('hospitalId') hospitalId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    // This uses admin client internally and verifies super admin access
    return this.hospitalsService.getHospitalMembersWithCompliance(hospitalId);
  }

  /**
   * Get hospital members
   */
  @Get(':hospitalId/members')
  async getHospitalMembers(
    @Param('hospitalId') hospitalId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.hospitalsService.getHospitalMembers(hospitalId, req.accessToken);
  }

  /**
   * Update a hospital member (SUPER_ADMIN only)
   */
  @Patch(':hospitalId/members/:memberId')
  async updateHospitalMember(
    @Param('hospitalId') hospitalId: string,
    @Param('memberId') memberId: string,
    @Body() body: { isPrimary?: boolean },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.hospitalsService.updateHospitalMember(
      hospitalId,
      memberId,
      body,
      req.user.id,
      req.accessToken,
    );
  }

  /**
   * Remove a hospital member (SUPER_ADMIN only)
   */
  @Delete(':hospitalId/members/:memberId')
  async removeHospitalMember(
    @Param('hospitalId') hospitalId: string,
    @Param('memberId') memberId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.hospitalsService.removeHospitalMember(
      hospitalId,
      memberId,
      req.user.id,
      req.accessToken,
    );
  }
}
