import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DoctorsService } from './doctors.service';
import { SupabaseGuard, AuthenticatedRequest } from '../supabase/supabase.guard';

@Controller('v1/doctors')
@UseGuards(SupabaseGuard)
export class DoctorsController {
  constructor(private doctorsService: DoctorsService) {}

  /**
   * Get current doctor's own profile and dashboard data
   * GET /v1/doctors/me
   */
  @Get('me')
  async getMyProfile(@Req() req: AuthenticatedRequest) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    const userId = req.user.id;
    return this.doctorsService.getDoctorDashboard(userId, hospitalId);
  }

  /**
   * Get current doctor's stats for today
   * GET /v1/doctors/me/stats
   */
  @Get('me/stats')
  async getMyStats(@Req() req: AuthenticatedRequest) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    const userId = req.user.id;
    return this.doctorsService.getDoctorStats(userId, hospitalId);
  }

  /**
   * Doctor check-in for the day
   * POST /v1/doctors/me/checkin
   */
  @Post('me/checkin')
  async checkIn(
    @Body() body: { date?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    const userId = req.user.id;
    console.log(`[DoctorsController] Doctor ${userId} checking in for hospital ${hospitalId}`);
    return this.doctorsService.doctorCheckIn(userId, hospitalId, body.date);
  }

  /**
   * Doctor check-out for the day
   * POST /v1/doctors/me/checkout
   */
  @Post('me/checkout')
  async checkOut(
    @Body() body: { date?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    const userId = req.user.id;
    console.log(`[DoctorsController] Doctor ${userId} checking out for hospital ${hospitalId}`);
    return this.doctorsService.doctorCheckOut(userId, hospitalId, body.date);
  }

  /**
   * Get doctor's queue for a specific date
   * GET /v1/doctors/me/queue?date=YYYY-MM-DD
   */
  @Get('me/queue')
  async getMyQueue(
    @Query('date') date: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    const userId = req.user.id;
    console.log(`[DoctorsController] Getting queue for doctor ${userId} on ${date}`);
    return this.doctorsService.getDoctorQueue(userId, hospitalId, date);
  }

  /**
   * Get doctor's profile for editing (self)
   * GET /v1/doctors/me/profile
   */
  @Get('me/profile')
  async getMyProfileDetails(@Req() req: AuthenticatedRequest) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    const userId = req.user.id;
    return this.doctorsService.getDoctorProfileById(userId, hospitalId);
  }

  /**
   * Update current doctor's own profile
   * PATCH /v1/doctors/me/profile
   */
  @Patch('me/profile')
  async updateMyProfileDetails(
    @Body() body: {
      fullName?: string;
      phone?: string;
      dateOfBirth?: string;
      gender?: string;
      address?: string;
      emergencyContact?: string;
      emergencyPhone?: string;
      specialization?: string;
      qualification?: string;
      licenseNumber?: string;
      yearsOfExperience?: number;
      consultationFee?: number;
      education?: string;
      bio?: string;
    },
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    const userId = req.user.id;
    return this.doctorsService.updateDoctorProfileById(userId, hospitalId, body);
  }

  /**
   * Get doctor's schedules (self)
   * GET /v1/doctors/me/schedules
   */
  @Get('me/schedules')
  async getMySchedules(@Req() req: AuthenticatedRequest) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    const userId = req.user.id;
    return this.doctorsService.getSchedules(userId, hospitalId);
  }

  /**
   * Save doctor's schedules (self)
   * PATCH /v1/doctors/me/schedules
   */
  @Patch('me/schedules')
  async saveMySchedules(
    @Body() body: {
      schedules: Array<{
        dayOfWeek: number;
        isWorking: boolean;
        shiftStart: string | null;
        shiftEnd: string | null;
      }>;
    },
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    const userId = req.user.id;
    return this.doctorsService.saveSchedules(userId, hospitalId, body.schedules);
  }

  /**
   * Get doctor's time-off (self)
   * GET /v1/doctors/me/time-off
   */
  @Get('me/time-off')
  async getMyTimeOff(@Req() req: AuthenticatedRequest) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    const userId = req.user.id;
    return this.doctorsService.getTimeOff(userId, hospitalId);
  }

  /**
   * Add time-off (self)
   * POST /v1/doctors/me/time-off
   */
  @Post('me/time-off')
  async addMyTimeOff(
    @Body() body: { startDate: string; endDate: string; reason?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    const userId = req.user.id;
    return this.doctorsService.addTimeOff(userId, hospitalId, body.startDate, body.endDate, body.reason);
  }

  /**
   * Delete time-off (self)
   * DELETE /v1/doctors/me/time-off/:timeOffId
   */
  @Delete('me/time-off/:timeOffId')
  async deleteMyTimeOff(
    @Param('timeOffId') timeOffId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    const userId = req.user.id;
    return this.doctorsService.deleteTimeOff(timeOffId, userId, hospitalId);
  }

  /**
   * Get doctor's appointment duration (self)
   * GET /v1/doctors/me/appointment-duration
   */
  @Get('me/appointment-duration')
  async getMyAppointmentDuration(@Req() req: AuthenticatedRequest) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    const userId = req.user.id;
    return this.doctorsService.getAppointmentDuration(userId, hospitalId);
  }

  /**
   * Update doctor's appointment duration (self)
   * PATCH /v1/doctors/me/appointment-duration
   */
  @Patch('me/appointment-duration')
  async updateMyAppointmentDuration(
    @Body() body: { appointmentDurationMinutes: number },
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    const validDurations = [15, 20, 30, 45, 60];
    if (!validDurations.includes(body.appointmentDurationMinutes)) {
      throw new BadRequestException('Invalid appointment duration. Must be 15, 20, 30, 45, or 60 minutes.');
    }

    const userId = req.user.id;
    return this.doctorsService.updateAppointmentDuration(userId, hospitalId, body.appointmentDurationMinutes);
  }

  /**
   * Get doctor's appointments calendar for a month
   * GET /v1/doctors/me/appointments/calendar/:year/:month
   */
  @Get('me/appointments/calendar/:year/:month')
  async getMyAppointmentsCalendar(
    @Param('year') year: string,
    @Param('month') month: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    const userId = req.user.id;
    return this.doctorsService.getDoctorAppointmentsCalendar(
      userId,
      hospitalId,
      parseInt(year),
      parseInt(month),
    );
  }

  /**
   * Get doctor's appointments for a specific date
   * GET /v1/doctors/me/appointments?date=YYYY-MM-DD
   */
  @Get('me/appointments')
  async getMyAppointments(
    @Query('date') date: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    const userId = req.user.id;
    return this.doctorsService.getDoctorAppointmentsByDate(userId, hospitalId, date);
  }

  /**
   * Update current doctor's own profile
   * PATCH /v1/doctors/me
   */
  @Patch('me')
  async updateMyProfile(
    @Body() body: {
      phone?: string;
      dateOfBirth?: string;
      gender?: string;
      address?: string;
      emergencyContact?: string;
      emergencyPhone?: string;
      specialization?: string;
      qualification?: string;
      licenseNumber?: string;
      experience?: number;
      consultationFee?: number;
      education?: string;
      bio?: string;
    },
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    const userId = req.user.id;
    return this.doctorsService.updateDoctorProfile(userId, hospitalId, body);
  }

  /**
   * Upload avatar for current doctor
   * POST /v1/doctors/me/avatar
   */
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('avatar'))
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.');
    }

    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File too large. Maximum size is 2MB.');
    }

    const userId = req.user.id;

    // Convert to base64 data URL
    const base64 = file.buffer.toString('base64');
    const dataUrl = `data:${file.mimetype};base64,${base64}`;

    return this.doctorsService.updateDoctorAvatar(userId, hospitalId, dataUrl);
  }

  /**
   * Get a specific doctor's profile (for managers)
   * GET /v1/doctors/:userId/profile
   */
  @Get(':userId/profile')
  async getDoctorProfile(
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    return this.doctorsService.getDoctorProfileById(userId, hospitalId);
  }

  /**
   * Update a specific doctor's profile (for managers)
   * PATCH /v1/doctors/:userId/profile
   */
  @Patch(':userId/profile')
  async updateDoctorProfile(
    @Param('userId') userId: string,
    @Body() body: {
      fullName?: string;
      phone?: string;
      dateOfBirth?: string;
      gender?: string;
      address?: string;
      emergencyContact?: string;
      emergencyPhone?: string;
      specialization?: string;
      qualification?: string;
      licenseNumber?: string;
      yearsOfExperience?: number;
      consultationFee?: number;
      education?: string;
      bio?: string;
    },
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    return this.doctorsService.updateDoctorProfileById(userId, hospitalId, body);
  }

  /**
   * Get time-off entries for a doctor
   * GET /v1/doctors/:userId/time-off
   */
  @Get(':userId/time-off')
  async getTimeOff(
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    console.log(`[DoctorsController] Getting time-off for doctor ${userId} in hospital ${hospitalId}`);
    return this.doctorsService.getTimeOff(userId, hospitalId);
  }

  /**
   * Add time-off entry for a doctor
   * POST /v1/doctors/:userId/time-off
   */
  @Post(':userId/time-off')
  async addTimeOff(
    @Param('userId') userId: string,
    @Body() body: { startDate: string; endDate: string; reason?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    if (!body.startDate || !body.endDate) {
      throw new BadRequestException('Start date and end date are required');
    }

    console.log(`[DoctorsController] Adding time-off for doctor ${userId}:`, body);
    return this.doctorsService.addTimeOff(
      userId,
      hospitalId,
      body.startDate,
      body.endDate,
      body.reason,
    );
  }

  /**
   * Delete time-off entry
   * DELETE /v1/doctors/:userId/time-off/:timeOffId
   */
  @Delete(':userId/time-off/:timeOffId')
  async deleteTimeOff(
    @Param('userId') userId: string,
    @Param('timeOffId') timeOffId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    console.log(`[DoctorsController] Deleting time-off ${timeOffId} for doctor ${userId}`);
    return this.doctorsService.deleteTimeOff(timeOffId, userId, hospitalId);
  }

  /**
   * Get appointment duration for a doctor
   * GET /v1/doctors/:userId/appointment-duration
   */
  @Get(':userId/appointment-duration')
  async getAppointmentDuration(
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    return this.doctorsService.getAppointmentDuration(userId, hospitalId);
  }

  /**
   * Update appointment duration for a doctor
   * PATCH /v1/doctors/:userId/appointment-duration
   */
  @Patch(':userId/appointment-duration')
  async updateAppointmentDuration(
    @Param('userId') userId: string,
    @Body() body: { appointmentDurationMinutes: number },
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    const validDurations = [15, 20, 30, 45, 60];
    if (!validDurations.includes(body.appointmentDurationMinutes)) {
      throw new BadRequestException('Invalid appointment duration. Must be 15, 20, 30, 45, or 60 minutes.');
    }

    return this.doctorsService.updateAppointmentDuration(
      userId,
      hospitalId,
      body.appointmentDurationMinutes,
    );
  }

  /**
   * Get schedules for a doctor
   * GET /v1/doctors/:userId/schedules
   */
  @Get(':userId/schedules')
  async getSchedules(
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    return this.doctorsService.getSchedules(userId, hospitalId);
  }

  /**
   * Save schedules for a doctor
   * PUT /v1/doctors/:userId/schedules
   */
  @Patch(':userId/schedules')
  async saveSchedules(
    @Param('userId') userId: string,
    @Body() body: {
      schedules: Array<{
        dayOfWeek: number;
        isWorking: boolean;
        shiftStart: string | null;
        shiftEnd: string | null;
      }>;
    },
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('Hospital context required');
    }

    if (!body.schedules || !Array.isArray(body.schedules)) {
      throw new BadRequestException('Schedules array is required');
    }

    console.log(`[DoctorsController] Saving schedules for doctor ${userId}:`, body.schedules);
    return this.doctorsService.saveSchedules(userId, hospitalId, body.schedules);
  }
}
