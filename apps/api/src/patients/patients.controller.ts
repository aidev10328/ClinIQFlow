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
import { PatientsService } from './patients.service';
import { SupabaseGuard, AuthenticatedRequest } from '../supabase/supabase.guard';
import { CreatePatientDto, UpdatePatientDto } from './dto/patient.dto';

@Controller('v1/patients')
@UseGuards(SupabaseGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  /**
   * Get all patients for the current hospital
   */
  @Get()
  async getPatients(@Req() req: AuthenticatedRequest) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }
    return this.patientsService.getPatients(hospitalId, req.accessToken);
  }

  /**
   * Get a specific patient
   */
  @Get(':patientId')
  async getPatient(
    @Param('patientId') patientId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }
    return this.patientsService.getPatient(patientId, hospitalId, req.accessToken);
  }

  /**
   * Create a new patient
   */
  @Post()
  async createPatient(
    @Body() dto: CreatePatientDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }
    return this.patientsService.createPatient(dto, hospitalId, req.accessToken);
  }

  /**
   * Update a patient
   */
  @Patch(':patientId')
  async updatePatient(
    @Param('patientId') patientId: string,
    @Body() dto: UpdatePatientDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }
    return this.patientsService.updatePatient(patientId, dto, hospitalId, req.accessToken);
  }

  /**
   * Delete a patient
   */
  @Delete(':patientId')
  async deletePatient(
    @Param('patientId') patientId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      throw new BadRequestException('x-hospital-id header is required');
    }
    return this.patientsService.deletePatient(patientId, hospitalId, req.accessToken);
  }
}
