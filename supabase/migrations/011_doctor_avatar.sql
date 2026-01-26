-- Migration: Add avatar_url to doctor_profiles
-- Description: Allow doctors to upload profile pictures

-- Add avatar_url column to doctor_profiles
ALTER TABLE doctor_profiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Add comment
COMMENT ON COLUMN doctor_profiles.avatar_url IS 'URL or base64 data URL for doctor profile picture';
