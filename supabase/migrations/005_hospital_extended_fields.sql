-- ============================================================================
-- ClinQflow Hospital Extended Fields
-- Migration: 005_hospital_extended_fields
-- ============================================================================

-- Add contact and branding fields to hospitals table
ALTER TABLE hospitals
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS website TEXT,
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS picture_url TEXT;

-- Add index for email lookups
CREATE INDEX IF NOT EXISTS idx_hospitals_email ON hospitals(email) WHERE email IS NOT NULL;
