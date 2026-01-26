import {
  IsString,
  IsOptional,
  IsUUID,
  IsDateString,
  IsEnum,
} from 'class-validator';

export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export class CreateAppointmentDto {
  @IsUUID()
  slotId: string;

  @IsUUID()
  patientId: string;

  @IsOptional()
  @IsString()
  reasonForVisit?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAppointmentDto {
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  reasonForVisit?: string;
}

export class CancelAppointmentDto {
  @IsOptional()
  @IsString()
  cancellationReason?: string;
}

export class GetAppointmentsQueryDto {
  @IsOptional()
  @IsUUID()
  doctorProfileId?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;
}

export class AppointmentResponseDto {
  id: string;
  hospitalId: string;
  slotId: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  patientEmail?: string;
  doctorProfileId: string;
  doctorName: string;
  doctorSpecialization?: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  reasonForVisit?: string;
  notes?: string;
  cancellationReason?: string;
  bookedAt: string;
  bookedByUserId?: string;
  bookedByName?: string;
  createdAt: string;
}

export class AppointmentStatsDto {
  total: number;
  booked: number;
  available: number;
  completed: number;
  cancelled: number;
  noShow: number;
  scheduled: number;
}
