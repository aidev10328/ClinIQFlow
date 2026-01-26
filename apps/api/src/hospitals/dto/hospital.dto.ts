import { IsString, IsOptional, IsEnum } from 'class-validator';

export enum HospitalRegion {
  US = 'US',
  UK = 'UK',
  IN = 'IN',
}

export class CreateHospitalDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  postal?: string;

  @IsString()
  country: string;

  @IsEnum(HospitalRegion)
  region: HospitalRegion;

  @IsString()
  currency: string;

  @IsString()
  timezone: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  pictureUrl?: string;
}

export class UpdateHospitalDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  postal?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsEnum(HospitalRegion)
  region?: HospitalRegion;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  pictureUrl?: string;
}

export class HospitalResponseDto {
  id: string;
  name: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postal?: string;
  country: string;
  region: string;
  currency: string;
  timezone: string;
  status: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  pictureUrl?: string;
  createdAt: string;
  updatedAt: string;
}
