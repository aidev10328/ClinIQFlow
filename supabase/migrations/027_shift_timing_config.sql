-- Add shift_timing_config JSONB column to doctor_profiles
-- Stores the morning/evening/night shift boundaries configured per doctor
ALTER TABLE doctor_profiles
ADD COLUMN IF NOT EXISTS shift_timing_config JSONB DEFAULT NULL;

COMMENT ON COLUMN doctor_profiles.shift_timing_config IS 'JSON config for shift period boundaries: { morning: { start, end }, evening: { start, end }, night: { start, end } }';
