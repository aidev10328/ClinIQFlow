import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { SupabaseGuard, AuthenticatedRequest } from '../supabase/supabase.guard';
import { FeatureGateGuard, RequireProduct } from '../products/feature-gate.guard';
import { ProductCode } from '../products/dto/products.dto';
import {
  GenerateSlotsDto,
  GetSlotsQueryDto,
  BlockSlotDto,
} from './dto/slot.dto';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  CancelAppointmentDto,
  GetAppointmentsQueryDto,
} from './dto/appointment.dto';

@Controller('v1/appointments')
@UseGuards(SupabaseGuard, FeatureGateGuard)
@RequireProduct(ProductCode.APPOINTMENTS)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  // ============ Slot Endpoints ============

  /**
   * Generate appointment slots for a doctor
   * POST /v1/appointments/slots/generate
   */
  @Post('slots/generate')
  async generateSlots(
    @Body() dto: GenerateSlotsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    return this.appointmentsService.generateSlots(
      dto,
      hospitalId,
      req.user.id,
      req.accessToken,
    );
  }

  /**
   * Check for conflicts when schedule/duration/time-off changes
   * POST /v1/appointments/slots/check-conflicts
   */
  @Post('slots/check-conflicts')
  async checkScheduleConflicts(
    @Body() body: { doctorProfileId: string; changeType: 'schedule' | 'duration' | 'timeoff'; payload: any },
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }
    if (!body.doctorProfileId) {
      throw new BadRequestException('doctorProfileId is required');
    }
    return this.appointmentsService.checkScheduleConflicts(
      body.doctorProfileId,
      hospitalId,
      body.changeType,
      body.payload || {},
    );
  }

  /**
   * Regenerate slots: cancel conflicts, delete future AVAILABLE slots, regenerate
   * POST /v1/appointments/slots/regenerate
   */
  @Post('slots/regenerate')
  async regenerateSlots(
    @Body() body: { doctorProfileId: string; cancelAppointmentIds: string[] },
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }
    if (!body.doctorProfileId) {
      throw new BadRequestException('doctorProfileId is required');
    }
    return this.appointmentsService.regenerateSlots(
      body.doctorProfileId,
      hospitalId,
      req.user.id,
      req.accessToken,
      body.cancelAppointmentIds || [],
    );
  }

  /**
   * Get the latest slot date for a doctor
   * GET /v1/appointments/slots/latest
   */
  @Get('slots/latest')
  async getLatestSlotDate(
    @Query('doctorProfileId') doctorProfileId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }
    if (!doctorProfileId) {
      throw new BadRequestException('doctorProfileId query parameter is required');
    }
    return this.appointmentsService.getLatestSlotDate(doctorProfileId, hospitalId);
  }

  /**
   * Get slots for a specific date
   * GET /v1/appointments/slots/date/:date
   */
  @Get('slots/date/:date')
  async getSlotsForDate(
    @Param('date') date: string,
    @Query('doctorProfileId') doctorProfileId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    if (!doctorProfileId) {
      throw new BadRequestException('doctorProfileId query parameter is required');
    }

    return this.appointmentsService.getSlotsForDate(
      doctorProfileId,
      date,
      hospitalId,
      req.accessToken,
    );
  }

  /**
   * Get appointment counts for calendar display (date range)
   * GET /v1/appointments/calendar
   */
  @Get('calendar')
  async getCalendarAppointmentCounts(
    @Query('doctorProfileId') doctorProfileId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    if (!doctorProfileId) {
      throw new BadRequestException('doctorProfileId query parameter is required');
    }

    return this.appointmentsService.getCalendarAppointmentCounts(
      doctorProfileId,
      startDate,
      endDate,
      hospitalId,
    );
  }

  /**
   * Get calendar overview for a month
   * GET /v1/appointments/calendar/:year/:month
   */
  @Get('calendar/:year/:month')
  async getCalendarOverview(
    @Param('year') year: string,
    @Param('month') month: string,
    @Query('doctorProfileId') doctorProfileId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    if (!doctorProfileId) {
      throw new BadRequestException('doctorProfileId query parameter is required');
    }

    return this.appointmentsService.getCalendarOverview(
      doctorProfileId,
      parseInt(year, 10),
      parseInt(month, 10),
      hospitalId,
      req.accessToken,
    );
  }

  /**
   * Block a slot
   * PATCH /v1/appointments/slots/:slotId/block
   */
  @Patch('slots/:slotId/block')
  async blockSlot(
    @Param('slotId') slotId: string,
    @Body() dto: BlockSlotDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    return this.appointmentsService.blockSlot(
      slotId,
      hospitalId,
      req.user.id,
      req.accessToken,
    );
  }

  /**
   * Unblock a slot
   * PATCH /v1/appointments/slots/:slotId/unblock
   */
  @Patch('slots/:slotId/unblock')
  async unblockSlot(
    @Param('slotId') slotId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    return this.appointmentsService.unblockSlot(
      slotId,
      hospitalId,
      req.user.id,
      req.accessToken,
    );
  }

  // ============ Appointment Endpoints ============

  /**
   * Create/book an appointment
   * POST /v1/appointments
   */
  @Post()
  async createAppointment(
    @Body() dto: CreateAppointmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    return this.appointmentsService.createAppointment(
      dto,
      hospitalId,
      req.user.id,
      req.accessToken,
    );
  }

  /**
   * Get appointments list
   * GET /v1/appointments
   */
  @Get()
  async getAppointments(
    @Query() query: GetAppointmentsQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    return this.appointmentsService.getAppointments(
      query,
      hospitalId,
      req.accessToken,
      req.scopingContext,
    );
  }

  /**
   * Get appointment by ID
   * GET /v1/appointments/:id
   */
  @Get(':id')
  async getAppointment(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    return this.appointmentsService.getAppointmentById(
      id,
      hospitalId,
      req.accessToken,
    );
  }

  /**
   * Update appointment
   * PATCH /v1/appointments/:id
   */
  @Patch(':id')
  async updateAppointment(
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    return this.appointmentsService.updateAppointment(
      id,
      dto,
      hospitalId,
      req.user.id,
      req.accessToken,
    );
  }

  /**
   * Cancel appointment
   * PATCH /v1/appointments/:id/cancel
   */
  @Patch(':id/cancel')
  async cancelAppointment(
    @Param('id') id: string,
    @Body() dto: CancelAppointmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    return this.appointmentsService.cancelAppointment(
      id,
      dto,
      hospitalId,
      req.user.id,
      req.accessToken,
    );
  }

  /**
   * Get appointment stats for a doctor and date
   * GET /v1/appointments/stats
   */
  @Get('stats/:doctorProfileId/:date')
  async getStats(
    @Param('doctorProfileId') doctorProfileId: string,
    @Param('date') date: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    return this.appointmentsService.getStats(
      doctorProfileId,
      date,
      hospitalId,
      req.accessToken,
    );
  }

  /**
   * Get doctors with appointments license (for dropdown)
   * GET /v1/appointments/doctors
   */
  @Get('doctors/licensed')
  async getDoctorsWithLicense(@Req() req: AuthenticatedRequest) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }

    return this.appointmentsService.getDoctorsWithLicense(
      hospitalId,
      req.user.id,
      req.accessToken,
      req.scopingContext,
    );
  }
}
