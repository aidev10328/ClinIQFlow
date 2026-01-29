-- Migration: Add extended fields to doctor_profiles
-- Adds: address split, national ID, employment type, department, emergency relation

-- Split address into structured fields
ALTER TABLE doctor_profiles
ADD COLUMN IF NOT EXISTS address_line1 TEXT,
ADD COLUMN IF NOT EXISTS address_line2 TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS postal_code TEXT,
ADD COLUMN IF NOT EXISTS country TEXT;

-- National ID
ALTER TABLE doctor_profiles
ADD COLUMN IF NOT EXISTS national_id TEXT;

-- Employment type: Full-time, Visiting, Consultant
ALTER TABLE doctor_profiles
ADD COLUMN IF NOT EXISTS employment_type TEXT;

-- Department (e.g., Emergency, Surgery, Internal Medicine, etc.)
ALTER TABLE doctor_profiles
ADD COLUMN IF NOT EXISTS department TEXT;

-- Emergency contact relationship (Spouse, Parent, Sibling, etc.)
ALTER TABLE doctor_profiles
ADD COLUMN IF NOT EXISTS emergency_relation TEXT;

-- Comments
COMMENT ON COLUMN doctor_profiles.address_line1 IS 'Street address line 1';
COMMENT ON COLUMN doctor_profiles.address_line2 IS 'Street address line 2 (apt, suite, etc.)';
COMMENT ON COLUMN doctor_profiles.city IS 'City';
COMMENT ON COLUMN doctor_profiles.state IS 'State or province';
COMMENT ON COLUMN doctor_profiles.postal_code IS 'Postal / ZIP code';
COMMENT ON COLUMN doctor_profiles.country IS 'Country code (ISO)';
COMMENT ON COLUMN doctor_profiles.national_id IS 'National ID number (e.g., SSN, Aadhaar, NIN)';
COMMENT ON COLUMN doctor_profiles.employment_type IS 'Employment type: Full-time, Visiting, Consultant';
COMMENT ON COLUMN doctor_profiles.department IS 'Hospital department';
COMMENT ON COLUMN doctor_profiles.emergency_relation IS 'Relationship to emergency contact';
