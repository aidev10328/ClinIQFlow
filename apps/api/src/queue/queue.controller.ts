import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { QueueService } from './queue.service';
import { SupabaseGuard, AuthenticatedRequest } from '../supabase/supabase.guard';
import {
  AddWalkInDto,
  UpdateQueueStatusDto,
  UpdateQueuePriorityDto,
} from './dto/queue.dto';

@Controller('v1/queue')
@UseGuards(SupabaseGuard)
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  /**
   * Get queue stats for trends (walk-ins and scheduled by date)
   * GET /v1/queue/stats?startDate=2024-01-01&endDate=2024-01-31&doctorProfileId=xxx
   */
  @Get('stats')
  async getQueueStats(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('doctorProfileId') doctorProfileId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    if (!startDate || !endDate) {
      throw new BadRequestException('startDate and endDate query parameters required');
    }

    return this.queueService.getQueueStats(hospitalId, startDate, endDate, doctorProfileId || undefined);
  }

  /**
   * Get daily queue for a doctor
   * GET /v1/queue/daily?doctorProfileId=xxx&date=2024-01-26
   */
  @Get('daily')
  async getDailyQueue(
    @Query('doctorProfileId') doctorProfileId: string,
    @Query('date') date: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    if (!doctorProfileId) {
      throw new BadRequestException('doctorProfileId query parameter required');
    }

    // Date is required from frontend (hospital-timezone-aware); keep fallback for safety
    const queueDate = date || '';

    return this.queueService.getDailyQueue(hospitalId, doctorProfileId, queueDate);
  }

  /**
   * Add walk-in patient to queue
   * POST /v1/queue/walk-in
   */
  @Post('walk-in')
  async addWalkIn(
    @Body() dto: AddWalkInDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    return this.queueService.addWalkIn(hospitalId, dto, req.user.id);
  }

  /**
   * Check in scheduled appointment
   * POST /v1/queue/check-in/:appointmentId
   */
  @Post('check-in/:appointmentId')
  async checkInAppointment(
    @Param('appointmentId') appointmentId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    return this.queueService.checkInAppointment(hospitalId, appointmentId, req.user.id);
  }

  /**
   * Mark scheduled appointment as no-show
   * POST /v1/queue/appointment/:appointmentId/no-show
   */
  @Post('appointment/:appointmentId/no-show')
  async markAppointmentNoShow(
    @Param('appointmentId') appointmentId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    return this.queueService.markAppointmentNoShow(hospitalId, appointmentId, req.user.id);
  }

  /**
   * Update queue entry status
   * PATCH /v1/queue/:entryId/status
   */
  @Patch(':entryId/status')
  async updateQueueStatus(
    @Param('entryId') entryId: string,
    @Body() dto: UpdateQueueStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    return this.queueService.updateQueueStatus(hospitalId, entryId, dto);
  }

  /**
   * Update queue entry priority
   * PATCH /v1/queue/:entryId/priority
   */
  @Patch(':entryId/priority')
  async updateQueuePriority(
    @Param('entryId') entryId: string,
    @Body() dto: UpdateQueuePriorityDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    return this.queueService.updateQueuePriority(hospitalId, entryId, dto);
  }

  /**
   * Doctor check-in
   * POST /v1/queue/doctor/check-in
   */
  @Post('doctor/check-in')
  async doctorCheckIn(
    @Body() body: { doctorProfileId: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    if (!body.doctorProfileId) {
      throw new BadRequestException('doctorProfileId required');
    }

    return this.queueService.doctorCheckIn(hospitalId, body.doctorProfileId, req.user.id);
  }

  /**
   * Doctor check-out
   * POST /v1/queue/doctor/check-out
   */
  @Post('doctor/check-out')
  async doctorCheckOut(
    @Body() body: { doctorProfileId: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    if (!body.doctorProfileId) {
      throw new BadRequestException('doctorProfileId required');
    }

    return this.queueService.doctorCheckOut(hospitalId, body.doctorProfileId);
  }

  /**
   * Remove entry from queue
   * DELETE /v1/queue/:entryId
   */
  @Delete(':entryId')
  async removeFromQueue(
    @Param('entryId') entryId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header required');
    }

    await this.queueService.removeFromQueue(hospitalId, entryId);
    return { success: true };
  }
}
