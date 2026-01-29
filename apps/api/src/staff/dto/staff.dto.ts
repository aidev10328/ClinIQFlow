import { IsString, MinLength, IsOptional, IsEmail, IsArray, IsUUID, IsEnum } from 'class-validator';

export class CreateStaffDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  displayName: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assignedDoctorIds?: string[];
}

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assignedDoctorIds?: string[];
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class StaffResponseDto {
  id: string;
  email: string;
  displayName: string;
  title?: string | null;
  phone?: string | null;
  status: string;
  hospitalId: string;
  hospitalName?: string;
  assignedDoctorIds?: string[] | null;
  createdAt: string;
}
