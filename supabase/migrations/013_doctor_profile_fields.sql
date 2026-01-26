-- Migration: Add missing fields to doctor_profiles
-- Description: Add qualification and consultation_fee columns

-- Add qualification column
ALTER TABLE doctor_profiles
ADD COLUMN IF NOT EXISTS qualification TEXT;

COMMENT ON COLUMN doctor_profiles.qualification IS 'Doctor qualifications (e.g., MBBS, MD)';

-- Add consultation_fee column
ALTER TABLE doctor_profiles
ADD COLUMN IF NOT EXISTS consultation_fee DECIMAL(10, 2);

COMMENT ON COLUMN doctor_profiles.consultation_fee IS 'Consultation fee for the doctor';
