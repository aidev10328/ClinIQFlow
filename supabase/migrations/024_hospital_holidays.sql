-- Add hospital holidays (JSONB array of { month, day, name } objects for recurring yearly holidays)
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS hospital_holidays JSONB DEFAULT '[]'::jsonb;
