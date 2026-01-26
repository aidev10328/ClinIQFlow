# Step 4: Products, Pricing, Subscriptions, Licenses & Feature Gating

This document describes the implementation of the multi-tenant billing and feature gating system for ClinQFlow.

## Overview

The system implements a per-doctor-per-month SaaS pricing model with:
- Multiple products (APPOINTMENTS, CLINIQ_BRIEF)
- Regional pricing (US, UK, India)
- Discount codes with validation rules
- Hospital subscriptions with license management
- API and UI feature gating

## Database Schema

### Tables

#### `products`
Master list of available products:
- `code`: Product identifier (APPOINTMENTS, CLINIQ_BRIEF)
- `name`: Display name
- `description`: Product description
- `features`: JSON array of feature bullet points
- `is_active`: Whether product is available for sale

#### `product_pricing`
Regional pricing for each product:
- `product_id`: FK to products
- `region`: US, UK, or IN
- `currency`: USD, GBP, or INR
- `price_per_doctor_per_month`: Decimal amount
- `effective_at`: When this price becomes effective

#### `discount_codes`
Promotional discount codes:
- `code`: Unique code (e.g., LAUNCH20)
- `discount_type`: PERCENTAGE or FIXED_AMOUNT
- `discount_value`: Amount or percentage
- `max_redemptions`: Usage limit (null = unlimited)
- `valid_from` / `valid_until`: Validity period
- `min_doctors` / `max_doctors`: Doctor count restrictions
- `applicable_products`: Array of product codes (empty = all)
- `applicable_regions`: Array of regions (empty = all)

#### `hospital_subscriptions`
Hospital subscription records:
- `hospital_id`: FK to hospitals
- `status`: ACTIVE, TRIAL, PAST_DUE, CANCELLED, EXPIRED
- `billing_cycle_start` / `billing_cycle_end`: Billing period
- `trial_ends_at`: Trial expiration (if applicable)

#### `hospital_subscription_items`
Line items within a subscription:
- `subscription_id`: FK to hospital_subscriptions
- `product_id`: FK to products
- `doctor_limit`: Number of licensed doctors
- `price_per_doctor`: Locked-in price
- `discount_code_id`: Applied discount (if any)
- `discount_amount`: Discount amount applied

#### `doctor_product_licenses`
Individual doctor licenses:
- `hospital_id`: FK to hospitals
- `doctor_id`: FK to profiles (user)
- `product_id`: FK to products
- `status`: ACTIVE, REVOKED, EXPIRED
- `assigned_by`: FK to profiles (manager who assigned)

#### `discount_redemptions`
Audit trail of discount usage:
- `discount_code_id`: FK to discount_codes
- `hospital_id`: FK to hospitals
- `subscription_id`: FK to hospital_subscriptions

### Database Functions

#### `can_access_product(hospital_id, user_id, product_code)`
Returns boolean indicating if user can access a product. Checks:
1. User is a super admin (always has access)
2. User is a hospital manager with active subscription
3. User is a doctor with active license

#### `get_user_entitlements(hospital_id, user_id)`
Returns all products with access status for a user at a hospital.

#### `validate_discount_code(code, product_code, doctor_count, region)`
Validates a discount code and returns discount details or error message.

## API Endpoints

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/products` | List products with pricing |
| GET | `/v1/products/pricing/:region` | Get pricing for specific region |
| POST | `/v1/products/discounts/validate` | Validate a discount code |
| GET | `/v1/products/entitlements` | Get current user's entitlements |
| GET | `/v1/products/entitlements/check/:productCode` | Check access to specific product |

### Super Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/products/admin/discounts` | List all discount codes |
| POST | `/v1/products/admin/discounts` | Create discount code |
| PATCH | `/v1/products/admin/discounts/:id` | Update discount code |
| GET | `/v1/products/admin/subscriptions` | List all subscriptions |
| GET | `/v1/products/admin/subscriptions/stats` | Get subscription statistics |
| POST | `/v1/products/admin/subscriptions` | Create subscription for hospital |
| PATCH | `/v1/products/admin/subscriptions/:hospitalId` | Update subscription |

### Hospital Manager Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/products/subscription` | Get hospital's subscription |
| GET | `/v1/products/subscription/license-stats` | Get license usage stats |
| GET | `/v1/products/licenses` | List all licenses |
| POST | `/v1/products/licenses/assign` | Assign license to doctor |
| POST | `/v1/products/licenses/assign-bulk` | Bulk assign licenses |
| DELETE | `/v1/products/licenses/:licenseId` | Revoke license |

## API Feature Gating

Use the `FeatureGateGuard` to protect routes:

```typescript
import { RequireProduct, FeatureGateGuard } from '../products/feature-gate.guard';
import { ProductCode } from '../products/dto/products.dto';

@Controller('v1/cliniq-brief')
export class CliniqBriefController {

  @Get('summary')
  @RequireProduct(ProductCode.CLINIQ_BRIEF)
  @UseGuards(SupabaseGuard, FeatureGateGuard)
  async getSummary() {
    // Only accessible if user has CLINIQ_BRIEF license
  }
}
```

## Frontend Feature Gating

### Using the FeatureGate Component

```tsx
import { FeatureGate } from '@/components/FeatureGate';

// Basic usage - hide content if no access
<FeatureGate productCode="CLINIQ_BRIEF">
  <CliniqBriefFeature />
</FeatureGate>

// With custom fallback
<FeatureGate productCode="APPOINTMENTS" fallback={<UpgradePrompt />}>
  <AppointmentsCalendar />
</FeatureGate>

// With default upgrade message
<FeatureGate productCode="CLINIQ_BRIEF" showUpgradeMessage>
  <CliniqBriefFeature />
</FeatureGate>
```

### Using the Hook

```tsx
import { useFeatureAccess } from '@/components/FeatureGate';
import { useAuth } from '@/components/AuthProvider';

function MyComponent() {
  // Simple check
  const { hasAccess, loading } = useFeatureAccess('CLINIQ_BRIEF');

  // Or use the auth context directly
  const { canAccessProduct } = useAuth();
  const hasAppointments = canAccessProduct('APPOINTMENTS');

  if (loading) return <Spinner />;
  if (!hasAccess) return <UpgradeCTA />;

  return <CliniqBriefFeature />;
}
```

## UI Pages

### Super Admin Pages
- `/admin/products` - View products and pricing
- `/admin/discounts` - Manage discount codes
- `/admin/subscriptions` - Manage hospital subscriptions

### Hospital Manager Pages
- `/hospital/billing` - View subscription and manage licenses

## Pricing Structure

### Current Products

| Product | US (USD) | UK (GBP) | India (INR) |
|---------|----------|----------|-------------|
| Appointments | $29/doctor/month | £24/doctor/month | ₹999/doctor/month |
| CliniqBrief | $49/doctor/month | £39/doctor/month | ₹1,999/doctor/month |

## Subscription Workflow

1. **Super Admin creates subscription** for a hospital
   - Select products and doctor limits
   - Apply discount codes (optional)
   - Start with trial period (optional)

2. **Hospital Manager manages licenses**
   - View subscription details and usage
   - Assign licenses to doctors
   - Revoke licenses when needed

3. **Doctors access features** based on licenses
   - Feature gates check license status
   - Graceful fallback for unlicensed features

## Migration

Run the migration to set up tables and seed data:

```bash
# Apply migration via Supabase CLI
supabase db push

# Or run directly
psql $DATABASE_URL -f supabase/migrations/004_products_subscriptions.sql
```

## Environment Variables

No additional environment variables required. The system uses existing Supabase configuration.

## Security

- RLS policies enforce access control at database level
- Super admins have full access to all billing data
- Hospital managers can only see their hospital's data
- Doctors can only check their own entitlements
- Discount codes are validated server-side

## Testing Discount Codes

Use the validation endpoint:

```bash
curl -X POST http://localhost:4000/v1/products/discounts/validate \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-hospital-id: $HOSPITAL_ID" \
  -H "Content-Type: application/json" \
  -d '{"code": "LAUNCH20", "productCode": "APPOINTMENTS", "doctorCount": 5}'
```

Response:
```json
{
  "isValid": true,
  "discountType": "PERCENTAGE",
  "discountValue": 20
}
```
