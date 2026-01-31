-- Migration: Add hospital compliance/insurance/accreditation fields
-- These support the Legal, Tax & Compliance card in hospital administration

ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS insurance_provider TEXT;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS insurance_policy_number TEXT;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS accreditation_body TEXT;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS accreditation_number TEXT;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS accreditation_expiry DATE;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS license_number TEXT;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS license_expiry DATE;
