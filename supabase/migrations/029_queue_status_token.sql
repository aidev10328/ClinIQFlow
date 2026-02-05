-- Migration: Add status_token to queue_entries for public patient queue status page
-- This token allows patients to check their queue position via a public link

-- Add status_token column
ALTER TABLE queue_entries
  ADD COLUMN IF NOT EXISTS status_token UUID DEFAULT gen_random_uuid();

-- Create unique index on status_token
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_entries_status_token
  ON queue_entries (status_token)
  WHERE status_token IS NOT NULL;

-- Backfill existing entries that don't have a token
UPDATE queue_entries SET status_token = gen_random_uuid() WHERE status_token IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE queue_entries ALTER COLUMN status_token SET NOT NULL;
ALTER TABLE queue_entries ALTER COLUMN status_token SET DEFAULT gen_random_uuid();

-- Grant select on queue_entries to anon role for public status endpoint
GRANT SELECT ON queue_entries TO anon;
GRANT SELECT ON doctor_daily_checkins TO anon;
GRANT SELECT ON doctor_profiles TO anon;
GRANT SELECT ON hospitals TO anon;
