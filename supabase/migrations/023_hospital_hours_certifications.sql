-- Add operating hours (JSONB) and certifications to hospitals table
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS operating_hours JSONB;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS certifications TEXT;
