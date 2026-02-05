import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';

@Controller('v1/appointments/public')
export class AppointmentPublicController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  /**
   * Get appointment status by token (no auth required)
   * GET /v1/appointments/public/status/:token
   */
  @Get('status/:token')
  async getAppointmentStatus(@Param('token') token: string) {
    return this.appointmentsService.getAppointmentStatusByToken(token);
  }

  /**
   * Cancel appointment by token (no auth required)
   * POST /v1/appointments/public/cancel/:token
   */
  @Post('cancel/:token')
  async cancelAppointment(
    @Param('token') token: string,
    @Body() body: { reason?: string },
  ) {
    return this.appointmentsService.cancelAppointmentByToken(token, body?.reason);
  }

  /**
   * Get available slots for reschedule (no auth required)
   * GET /v1/appointments/public/slots/:token?date=YYYY-MM-DD
   */
  @Get('slots/:token')
  async getAvailableSlots(
    @Param('token') token: string,
    @Query('date') date: string,
  ) {
    if (!date) {
      throw new Error('Date query parameter is required (YYYY-MM-DD)');
    }
    return this.appointmentsService.getAvailableSlotsForReschedule(token, date);
  }

  /**
   * Reschedule appointment by token (no auth required)
   * POST /v1/appointments/public/reschedule/:token
   */
  @Post('reschedule/:token')
  async rescheduleAppointment(
    @Param('token') token: string,
    @Body() body: { slotId: string },
  ) {
    if (!body?.slotId) {
      throw new Error('slotId is required');
    }
    return this.appointmentsService.rescheduleAppointmentByToken(token, body.slotId);
  }
}
