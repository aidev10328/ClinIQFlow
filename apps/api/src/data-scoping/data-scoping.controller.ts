import { Controller, Get, Put, Param, Body, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { SupabaseGuard, AuthenticatedRequest } from '../supabase/supabase.guard';
import { DataScopingService } from './data-scoping.service';
import { UpdateScopingRuleDto, BulkUpdateScopingRulesDto } from './dto/data-scoping.dto';

@Controller('v1/data-scoping')
@UseGuards(SupabaseGuard)
export class DataScopingController {
  constructor(private readonly service: DataScopingService) {}

  @Get('rules')
  async getAllRules() {
    return this.service.getAllRules();
  }

  @Get('rules/:role')
  async getRulesForRole(@Param('role') role: string) {
    return this.service.getRulesForRole(role);
  }

  @Put('rules')
  async updateRule(@Body() dto: UpdateScopingRuleDto, @Req() req: AuthenticatedRequest) {
    return this.service.updateRule(dto, req.user.id, req.accessToken);
  }

  @Put('rules/bulk')
  async bulkUpdateRules(@Body() dto: BulkUpdateScopingRulesDto, @Req() req: AuthenticatedRequest) {
    return this.service.bulkUpdateRules(dto.rules, req.user.id, req.accessToken);
  }

  @Get('my-context')
  async getMyContext(@Req() req: AuthenticatedRequest) {
    if (!req.hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }
    return this.service.resolveContext(req.user.id, req.hospitalId);
  }
}
