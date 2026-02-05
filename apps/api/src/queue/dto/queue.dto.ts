import { IsString, IsUUID, IsOptional, IsEnum, IsDateString } from 'class-validator';

export enum QueueEntryStatus {
  QUEUED = 'QUEUED',
  WAITING = 'WAITING',
  WITH_DOCTOR = 'WITH_DOCTOR',
  COMPLETED = 'COMPLETED',
  NO_SHOW = 'NO_SHOW',
  LEFT = 'LEFT',
}

export enum QueueEntryType {
  WALK_IN = 'WALK_IN',
  SCHEDULED = 'SCHEDULED',
}

export enum QueuePriority {
  NORMAL = 'NORMAL',
  URGENT = 'URGENT',
  EMERGENCY = 'EMERGENCY',
}

export enum DoctorDailyStatus {
  NOT_CHECKED_IN = 'NOT_CHECKED_IN',
  CHECKED_IN = 'CHECKED_IN',
  ON_BREAK = 'ON_BREAK',
  CHECKED_OUT = 'CHECKED_OUT',
}

// Add walk-in patient to queue
export class AddWalkInDto {
  @IsUUID()
  doctorProfileId: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsString()
  walkInName?: string;

  @IsOptional()
  @IsString()
  walkInPhone?: string;

  @IsOptional()
  @IsString()
  reasonForVisit?: string;

  @IsOptional()
  @IsEnum(QueuePriority)
  priority?: QueuePriority;
}

// Check in scheduled appointment
export class CheckInAppointmentDto {
  @IsUUID()
  appointmentId: string;
}

// Update queue entry status
export class UpdateQueueStatusDto {
  @IsEnum(QueueEntryStatus)
  status: QueueEntryStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

// Update queue entry priority
export class UpdateQueuePriorityDto {
  @IsEnum(QueuePriority)
  priority: QueuePriority;
}

// Doctor check-in/out
export class DoctorCheckinDto {
  @IsUUID()
  doctorProfileId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// Response DTOs
export interface QueueEntryDto {
  id: string;
  hospitalId: string;
  doctorProfileId: string;
  patientId: string | null;
  appointmentId: string | null;
  queueDate: string;
  queueNumber: number;
  entryType: QueueEntryType;
  status: QueueEntryStatus;
  priority: QueuePriority;
  walkInName: string | null;
  walkInPhone: string | null;
  reasonForVisit: string | null;
  checkedInAt: string;
  calledAt: string | null;
  withDoctorAt: string | null;
  completedAt: string | null;
  notes: string | null;
  waitTimeMinutes: number | null;
  consultationTimeMinutes: number | null;
  statusToken?: string;
  // Joined data
  patient?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
  };
  appointment?: {
    id: string;
    startTime: string;
    endTime: string;
  };
}

// Public queue status response (for patient-facing page)
export interface PublicQueueStatusDto {
  patientName: string;
  queueNumber: number;
  status: QueueEntryStatus;
  priority: QueuePriority;
  reasonForVisit: string | null;
  checkedInAt: string;
  calledAt: string | null;
  withDoctorAt: string | null;
  completedAt: string | null;
  waitTimeMinutes: number | null;
  patientsAhead: number;
  patientsBehind: number;
  estimatedWaitMinutes: number | null;
  doctorName: string;
  doctorCheckedIn: boolean;
  hospitalName: string;
  hospitalLogoUrl: string | null;
  queueDate: string;
  canCancel: boolean;
}

export interface DoctorCheckinDto {
  id: string;
  hospitalId: string;
  doctorProfileId: string;
  checkinDate: string;
  status: DoctorDailyStatus;
  checkedInAt: string | null;
  checkedOutAt: string | null;
}

export interface DailyQueueResponseDto {
  date: string;
  doctorCheckin: DoctorCheckinDto | null;
  queue: QueueEntryDto[];
  waiting: QueueEntryDto[];
  withDoctor: QueueEntryDto | null;
  completed: QueueEntryDto[];
  scheduled: Array<{
    id: string;
    appointmentId: string;
    startTime: string;
    endTime: string;
    patientId: string;
    patientName: string;
    patientPhone: string | null;
    status: string;
    isCheckedIn: boolean;
  }>;
  stats: {
    totalQueue: number;
    totalWaiting: number;
    totalScheduled: number;
    totalCompleted: number;
  };
  isHospitalHoliday: boolean;
  holidayName?: string;
}
