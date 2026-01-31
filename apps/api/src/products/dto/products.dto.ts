import {
  IsString,
  IsNumber,
  IsBoolean,
  IsUUID,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// =========================================
// Enums (matching database)
// =========================================

export enum ProductCode {
  APPOINTMENTS = 'APPOINTMENTS',
  CLINIQ_BRIEF = 'CLINIQ_BRIEF',
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  TRIAL = 'TRIAL',
  PAST_DUE = 'PAST_DUE',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum LicenseStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum DiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
}

export enum Region {
  US = 'US',
  UK = 'UK',
  IN = 'IN',
}

// =========================================
// Product DTOs
// =========================================

export class ProductDto {
  id: string;
  code: ProductCode;
  name: string;
  description: string;
  features: string[];
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export class ProductPricingDto {
  id: string;
  productId: string;
  region: Region;
  currency: string;
  pricePerDoctorPerMonth: number;
  isActive: boolean;
  effectiveAt: string;
}

export class ProductWithPricingDto extends ProductDto {
  pricing: ProductPricingDto[];
}

// =========================================
// Discount DTOs
// =========================================

export class DiscountCodeDto {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  description: string;
  isActive: boolean;
  maxRedemptions: number | null;
  currentRedemptions: number;
  validFrom: string;
  validUntil: string | null;
  minDoctors: number | null;
  maxDoctors: number | null;
  applicableProducts: ProductCode[];
  applicableRegions: Region[];
  createdAt: string;
}

export class CreateDiscountCodeDto {
  @IsString()
  code: string;

  @IsEnum(DiscountType)
  discountType: DiscountType;

  @IsNumber()
  @Min(0)
  discountValue: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  maxRedemptions?: number;

  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @IsNumber()
  @IsOptional()
  minDoctors?: number;

  @IsNumber()
  @IsOptional()
  maxDoctors?: number;

  @IsArray()
  @IsEnum(ProductCode, { each: true })
  @IsOptional()
  applicableProducts?: ProductCode[];

  @IsArray()
  @IsEnum(Region, { each: true })
  @IsOptional()
  applicableRegions?: Region[];
}

export class UpdateDiscountCodeDto {
  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(0)
  discountValue?: number;

  @IsNumber()
  @IsOptional()
  maxRedemptions?: number;

  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  minDoctors?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  maxDoctors?: number;

  @IsArray()
  @IsEnum(ProductCode, { each: true })
  @IsOptional()
  applicableProducts?: ProductCode[];

  @IsArray()
  @IsEnum(Region, { each: true })
  @IsOptional()
  applicableRegions?: Region[];
}

export class ValidateDiscountDto {
  @IsString()
  code: string;

  @IsEnum(ProductCode)
  productCode: ProductCode;

  @IsNumber()
  @Min(1)
  doctorCount: number;
}

export class DiscountValidationResultDto {
  isValid: boolean;
  discountType?: DiscountType;
  discountValue?: number;
  errorMessage?: string;
}

// =========================================
// Subscription DTOs
// =========================================

export class SubscriptionItemDto {
  id: string;
  productCode: ProductCode;
  productName: string;
  doctorLimit: number;
  pricePerDoctor: number;
  currency: string;
  discountCodeId: string | null;
  discountAmount: number;
  monthlyTotal: number;
}

export class HospitalSubscriptionDto {
  id: string;
  hospitalId: string;
  hospitalName: string;
  status: SubscriptionStatus;
  billingCycleStart: string;
  billingCycleEnd: string;
  trialEndsAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  items: SubscriptionItemDto[];
  totalMonthly: number;
}

export class SubscriptionItemInputDto {
  @IsEnum(ProductCode)
  productCode: ProductCode;

  @IsNumber()
  @Min(1)
  doctorLimit: number;

  @IsString()
  @IsOptional()
  discountCode?: string;
}

export class CreateSubscriptionDto {
  @IsUUID()
  hospitalId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubscriptionItemInputDto)
  items: SubscriptionItemInputDto[];

  @IsBoolean()
  @IsOptional()
  startTrial?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(90)
  trialDays?: number;
}

export class UpdateSubscriptionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubscriptionItemInputDto)
  @IsOptional()
  items?: SubscriptionItemInputDto[];

  @IsEnum(SubscriptionStatus)
  @IsOptional()
  status?: SubscriptionStatus;
}

// =========================================
// License DTOs
// =========================================

export class DoctorLicenseDto {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorEmail: string;
  productCode: ProductCode;
  productName: string;
  status: LicenseStatus;
  assignedAt: string;
  assignedByName: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export class AssignLicenseDto {
  @IsUUID()
  doctorId: string;

  @IsEnum(ProductCode)
  productCode: ProductCode;
}

export class RevokeLicenseDto {
  @IsUUID()
  licenseId: string;
}

export class BulkAssignLicensesDto {
  @IsArray()
  @IsUUID('all', { each: true })
  doctorIds: string[];

  @IsEnum(ProductCode)
  productCode: ProductCode;
}

// =========================================
// Entitlements DTOs
// =========================================

export class UserEntitlementsDto {
  hospitalId: string;
  hospitalName: string;
  products: {
    code: ProductCode;
    name: string;
    hasAccess: boolean;
    hasLicense: boolean;
  }[];
}

// =========================================
// Stats DTOs
// =========================================

export class SubscriptionStatsDto {
  totalSubscriptions: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  totalMRR: number;
  currency: string;
  byProduct: {
    productCode: ProductCode;
    productName: string;
    activeSubscriptions: number;
    totalDoctors: number;
    mrr: number;
  }[];
}

export class LicenseStatsDto {
  hospitalId: string;
  hospitalName: string;
  byProduct: {
    productCode: ProductCode;
    productName: string;
    totalLicenses: number;
    usedLicenses: number;
    availableLicenses: number;
  }[];
}
