import { IsEmail, IsUUID, IsEnum, IsOptional, IsString } from 'class-validator';

export enum InviteRole {
  HOSPITAL_MANAGER = 'HOSPITAL_MANAGER',
  DOCTOR = 'DOCTOR',
}

export class CreateManagerInviteDto {
  @IsUUID()
  hospitalId: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  message?: string;
}

export class CreateDoctorInviteDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  message?: string;
}

export class AcceptInviteDto {
  @IsString()
  token: string;
}

export class LookupInviteDto {
  @IsString()
  token: string;
}

export class InviteResponseDto {
  id: string;
  hospitalId: string;
  hospitalName: string;
  invitedEmail: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export class InviteLookupResponseDto {
  valid: boolean;
  hospitalName?: string;
  role?: string;
  invitedEmail?: string;
  expiresAt?: string;
  error?: string;
}

export class AcceptInviteResponseDto {
  success: boolean;
  hospitalId?: string;
  role?: string;
  isPrimary?: boolean;
  error?: string;
}
