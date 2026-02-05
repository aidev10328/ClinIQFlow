-- Migration: Add status_token to appointments for public patient status page
-- This token allows patients to check appointment status, cancel, or reschedule via a public link

-- Add status_token column
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS status_token UUID DEFAULT gen_random_uuid();

-- Create unique index on status_token
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_status_token
  ON appointments (status_token)
  WHERE status_token IS NOT NULL;

-- Backfill existing entries that don't have a token
UPDATE appointments SET status_token = gen_random_uuid() WHERE status_token IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE appointments ALTER COLUMN status_token SET NOT NULL;
ALTER TABLE appointments ALTER COLUMN status_token SET DEFAULT gen_random_uuid();

-- Grant select on appointments to anon role for public status endpoint
GRANT SELECT ON appointments TO anon;
