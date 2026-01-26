import { IsString, IsBoolean, IsOptional, IsEnum, IsUUID } from 'class-validator';

// Enums matching database
export enum LegalDocType {
  MSA = 'MSA',
  DPA = 'DPA',
  BAA = 'BAA',
  DOCTOR_CONSENT = 'DOCTOR_CONSENT',
}

export enum LegalDocRegion {
  GLOBAL = 'GLOBAL',
  US = 'US',
  UK = 'UK',
  IN = 'IN',
}

export enum AcceptanceMethod {
  CLICK_WRAP = 'CLICK_WRAP',
  DOCU_SIGN = 'DOCU_SIGN',
  WET_SIGNATURE = 'WET_SIGNATURE',
}

export enum RequirementStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
}

// Response DTOs
export class LegalRequirementDto {
  docId: string;
  docType: LegalDocType;
  title: string;
  region: LegalDocRegion;
  version: string;
  effectiveAt: string;
  requiredForRole: string;
  status: RequirementStatus;
  acceptedAt?: string;
}

export class LegalDocumentDto {
  docId: string;
  title: string;
  contentMarkdown: string;
  version: string;
  docType: LegalDocType;
  region: LegalDocRegion;
  effectiveAt: string;
}

export class AcceptanceRecordDto {
  id: string;
  docId: string;
  docTitle: string;
  docType: LegalDocType;
  hospitalId: string;
  hospitalName: string;
  userId: string;
  userEmail: string;
  roleAtAcceptance: string;
  acceptedAt: string;
  acceptanceMethod: AcceptanceMethod;
  signatureName?: string;
}

export class AcceptanceStatsDto {
  hospitalId: string;
  hospitalName: string;
  region: string;
  managerAcceptance: {
    required: number;
    accepted: number;
    percentage: number;
  };
  doctorAcceptance: {
    required: number;
    accepted: number;
    percentage: number;
  };
}

// Signature mode for e-signature
export enum SignatureMode {
  TYPE = 'type',
  DRAW = 'draw',
}

// Request DTOs
export class AcceptDocumentDto {
  @IsUUID()
  docId: string;

  @IsString()
  @IsOptional()
  signatureName?: string;

  @IsString()
  @IsOptional()
  signatureDataUrl?: string;

  @IsEnum(SignatureMode)
  @IsOptional()
  signatureMode?: SignatureMode;

  @IsBoolean()
  acknowledged: boolean;
}

export class CreateDocumentDto {
  @IsEnum(LegalDocType)
  docType: LegalDocType;

  @IsEnum(LegalDocRegion)
  region: LegalDocRegion;

  @IsString()
  version: string;

  @IsString()
  title: string;

  @IsString()
  contentMarkdown: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  effectiveAt?: string;
}

export class UpdateDocumentDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  contentMarkdown?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  effectiveAt?: string;
}

export class EnsureHospitalDocsDto {
  @IsUUID()
  hospitalId: string;
}
