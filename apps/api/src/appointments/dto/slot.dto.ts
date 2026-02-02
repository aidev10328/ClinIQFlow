import {
  IsString,
  IsOptional,
  IsUUID,
  IsDateString,
  IsNumber,
  IsEnum,
  IsArray,
  Min,
  Max,
} from 'class-validator';

export enum SlotStatus {
  AVAILABLE = 'AVAILABLE',
  BOOKED = 'BOOKED',
  BLOCKED = 'BLOCKED',
}

export enum SlotPeriod {
  MORNING = 'MORNING',
  EVENING = 'EVENING',
  NIGHT = 'NIGHT',
}

export class GenerateSlotsDto {
  @IsUUID()
  doctorProfileId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}

export class GetSlotsQueryDto {
  @IsUUID()
  doctorProfileId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsEnum(SlotStatus)
  status?: SlotStatus;
}

export class BlockSlotDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class SlotResponseDto {
  id: string;
  hospitalId: string;
  doctorProfileId: string;
  doctorName: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  period: SlotPeriod;
  status: SlotStatus;
  appointmentId?: string;
  patientId?: string;
  patientName?: string;
  createdAt: string;
}

export class SlotsForDateDto {
  date: string;
  formattedDate: string;
  morning: SlotResponseDto[];
  evening: SlotResponseDto[];
  night: SlotResponseDto[];
  stats: {
    total: number;
    available: number;
    booked: number;
    blocked: number;
  };
  isTimeOff?: boolean;
  timeOffReason?: string;
  cancelledAppointments?: {
    appointmentId: string;
    patientName: string;
    startTime: string;
    endTime: string;
    status: string;
  }[];
}

export class GenerateSlotsResponseDto {
  slotsGenerated: number;
  slotsSkipped: number;
  startDate: string;
  endDate: string;
  doctorProfileId: string;
}

export class CalendarDayDto {
  date: string;
  hasSlots: boolean;
  availableCount: number;
  bookedCount: number;
}
