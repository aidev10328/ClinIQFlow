-- ============================================================================
-- ClinQflow Hospital Extended Fields (Legal, Billing, Compliance, Type)
-- Migration: 015_hospital_new_fields
-- ============================================================================

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

CREATE TYPE hospital_type AS ENUM (
  'GENERAL',
  'SPECIALTY',
  'TEACHING',
  'RESEARCH',
  'CLINIC',
  'URGENT_CARE',
  'REHABILITATION',
  'PSYCHIATRIC',
  'CHILDREN',
  'GOVERNMENT'
);

CREATE TYPE tax_id_type AS ENUM (
  'EIN',
  'NPI',
  'GSTIN',
  'PAN',
  'TIN',
  'UTR',
  'CRN'
);

-- ============================================================================
-- 2. ADD COLUMNS TO HOSPITALS TABLE
-- ============================================================================

-- Legal entity fields
ALTER TABLE hospitals
ADD COLUMN IF NOT EXISTS legal_entity_name TEXT,
ADD COLUMN IF NOT EXISTS tax_id_type tax_id_type,
ADD COLUMN IF NOT EXISTS tax_id_value TEXT;

-- Billing contact
ALTER TABLE hospitals
ADD COLUMN IF NOT EXISTS billing_contact_email TEXT;

-- Billing address (separate from main address)
ALTER TABLE hospitals
ADD COLUMN IF NOT EXISTS billing_address_line1 TEXT,
ADD COLUMN IF NOT EXISTS billing_address_line2 TEXT,
ADD COLUMN IF NOT EXISTS billing_city TEXT,
ADD COLUMN IF NOT EXISTS billing_state TEXT,
ADD COLUMN IF NOT EXISTS billing_postal TEXT,
ADD COLUMN IF NOT EXISTS billing_country TEXT;

-- Compliance & data fields
ALTER TABLE hospitals
ADD COLUMN IF NOT EXISTS stores_phi BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS estimated_patient_volume INTEGER,
ADD COLUMN IF NOT EXISTS data_retention_days INTEGER;

-- Hospital type
ALTER TABLE hospitals
ADD COLUMN IF NOT EXISTS hospital_type hospital_type;

-- ============================================================================
-- 3. JUNCTION TABLE: hospital_specialties
-- ============================================================================

CREATE TABLE IF NOT EXISTS hospital_specialties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    specialization_id UUID NOT NULL REFERENCES specializations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(hospital_id, specialization_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hospital_specialties_hospital
    ON hospital_specialties(hospital_id);
CREATE INDEX IF NOT EXISTS idx_hospital_specialties_specialization
    ON hospital_specialties(specialization_id);

-- ============================================================================
-- 4. INDEXES FOR NEW COLUMNS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_hospitals_hospital_type
    ON hospitals(hospital_type) WHERE hospital_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hospitals_billing_email
    ON hospitals(billing_contact_email) WHERE billing_contact_email IS NOT NULL;

-- ============================================================================
-- 5. RLS FOR hospital_specialties
-- ============================================================================

ALTER TABLE hospital_specialties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins full access to hospital_specialties"
    ON hospital_specialties FOR ALL
    USING (current_user_is_super_admin());

CREATE POLICY "Members can read hospital specialties"
    ON hospital_specialties FOR SELECT
    USING (user_has_membership(auth.uid(), hospital_id));

CREATE POLICY "Hospital managers can manage hospital specialties"
    ON hospital_specialties FOR ALL
    USING (is_hospital_manager(auth.uid(), hospital_id));
