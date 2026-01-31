import { IsString, IsOptional, IsEnum, IsEmail, IsBoolean, IsInt, Min, IsArray, IsUUID, IsObject } from 'class-validator';

export enum HospitalRegion {
  US = 'US',
  UK = 'UK',
  IN = 'IN',
}

export enum HospitalType {
  GENERAL = 'GENERAL',
  SPECIALTY = 'SPECIALTY',
  TEACHING = 'TEACHING',
  RESEARCH = 'RESEARCH',
  CLINIC = 'CLINIC',
  URGENT_CARE = 'URGENT_CARE',
  REHABILITATION = 'REHABILITATION',
  PSYCHIATRIC = 'PSYCHIATRIC',
  CHILDREN = 'CHILDREN',
  GOVERNMENT = 'GOVERNMENT',
}

export enum TaxIdType {
  EIN = 'EIN',
  NPI = 'NPI',
  GSTIN = 'GSTIN',
  PAN = 'PAN',
  TIN = 'TIN',
  UTR = 'UTR',
  CRN = 'CRN',
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

  @IsOptional()
  @IsString()
  legalEntityName?: string;

  @IsOptional()
  @IsEnum(TaxIdType)
  taxIdType?: TaxIdType;

  @IsOptional()
  @IsString()
  taxIdValue?: string;

  @IsOptional()
  @IsEmail()
  billingContactEmail?: string;

  @IsOptional()
  @IsString()
  billingAddressLine1?: string;

  @IsOptional()
  @IsString()
  billingAddressLine2?: string;

  @IsOptional()
  @IsString()
  billingCity?: string;

  @IsOptional()
  @IsString()
  billingState?: string;

  @IsOptional()
  @IsString()
  billingPostal?: string;

  @IsOptional()
  @IsString()
  billingCountry?: string;

  @IsOptional()
  @IsBoolean()
  storesPhi?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedPatientVolume?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  dataRetentionDays?: number;

  @IsOptional()
  @IsEnum(HospitalType)
  hospitalType?: HospitalType;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  specialtyIds?: string[];

  @IsOptional()
  @IsString()
  insuranceProvider?: string;

  @IsOptional()
  @IsString()
  insurancePolicyNumber?: string;

  @IsOptional()
  @IsString()
  accreditationBody?: string;

  @IsOptional()
  @IsString()
  accreditationNumber?: string;

  @IsOptional()
  @IsString()
  accreditationExpiry?: string;

  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  licenseExpiry?: string;
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

  @IsOptional()
  @IsString()
  legalEntityName?: string;

  @IsOptional()
  @IsEnum(TaxIdType)
  taxIdType?: TaxIdType;

  @IsOptional()
  @IsString()
  taxIdValue?: string;

  @IsOptional()
  @IsEmail()
  billingContactEmail?: string;

  @IsOptional()
  @IsString()
  billingAddressLine1?: string;

  @IsOptional()
  @IsString()
  billingAddressLine2?: string;

  @IsOptional()
  @IsString()
  billingCity?: string;

  @IsOptional()
  @IsString()
  billingState?: string;

  @IsOptional()
  @IsString()
  billingPostal?: string;

  @IsOptional()
  @IsString()
  billingCountry?: string;

  @IsOptional()
  @IsBoolean()
  storesPhi?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedPatientVolume?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  dataRetentionDays?: number;

  @IsOptional()
  @IsEnum(HospitalType)
  hospitalType?: HospitalType;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  specialtyIds?: string[];

  @IsOptional()
  @IsString()
  insuranceProvider?: string;

  @IsOptional()
  @IsString()
  insurancePolicyNumber?: string;

  @IsOptional()
  @IsString()
  accreditationBody?: string;

  @IsOptional()
  @IsString()
  accreditationNumber?: string;

  @IsOptional()
  @IsString()
  accreditationExpiry?: string;

  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  licenseExpiry?: string;

  @IsOptional()
  @IsObject()
  operatingHours?: Record<string, { open: string; close: string; closed: boolean }>;

  @IsOptional()
  @IsString()
  certifications?: string;

  @IsOptional()
  @IsArray()
  hospitalHolidays?: { month: number; day: number; name: string }[];
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
  legalEntityName?: string;
  taxIdType?: string;
  taxIdValue?: string;
  billingContactEmail?: string;
  billingAddressLine1?: string;
  billingAddressLine2?: string;
  billingCity?: string;
  billingState?: string;
  billingPostal?: string;
  billingCountry?: string;
  storesPhi?: boolean;
  estimatedPatientVolume?: number;
  dataRetentionDays?: number;
  hospitalType?: string;
  specialties?: { id: string; name: string }[];
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  accreditationBody?: string;
  accreditationNumber?: string;
  accreditationExpiry?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  operatingHours?: Record<string, { open: string; close: string; closed: boolean }>;
  certifications?: string;
  hospitalHolidays?: { month: number; day: number; name: string }[];
  createdAt: string;
  updatedAt: string;
}
