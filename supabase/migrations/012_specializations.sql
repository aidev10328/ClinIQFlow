-- Migration: Create specializations table for system-managed doctor specializations
-- Description: Super admin can manage specializations that doctors can select from

-- Create specializations table
CREATE TABLE IF NOT EXISTS specializations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add comment
COMMENT ON TABLE specializations IS 'System-managed list of doctor specializations';

-- Add some common specializations
INSERT INTO specializations (name, description, sort_order) VALUES
    ('General Medicine', 'Primary care and general health', 1),
    ('Cardiology', 'Heart and cardiovascular system', 2),
    ('Dermatology', 'Skin, hair, and nails', 3),
    ('Endocrinology', 'Hormones and metabolism', 4),
    ('Gastroenterology', 'Digestive system', 5),
    ('Neurology', 'Brain and nervous system', 6),
    ('Obstetrics & Gynecology', 'Women''s health and pregnancy', 7),
    ('Oncology', 'Cancer treatment', 8),
    ('Ophthalmology', 'Eye care', 9),
    ('Orthopedics', 'Bones, joints, and muscles', 10),
    ('Pediatrics', 'Children''s health', 11),
    ('Psychiatry', 'Mental health', 12),
    ('Pulmonology', 'Lungs and respiratory system', 13),
    ('Radiology', 'Medical imaging', 14),
    ('Urology', 'Urinary system', 15),
    ('ENT (Otolaryngology)', 'Ear, nose, and throat', 16),
    ('Nephrology', 'Kidney care', 17),
    ('Rheumatology', 'Joints and autoimmune diseases', 18),
    ('Anesthesiology', 'Pain management and anesthesia', 19),
    ('Emergency Medicine', 'Urgent and emergency care', 20)
ON CONFLICT (name) DO NOTHING;

-- Add specialization_id foreign key to doctor_profiles
ALTER TABLE doctor_profiles
ADD COLUMN IF NOT EXISTS specialization_id UUID REFERENCES specializations(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_doctor_profiles_specialization ON doctor_profiles(specialization_id);
CREATE INDEX IF NOT EXISTS idx_specializations_active ON specializations(is_active) WHERE is_active = true;

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_specializations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS specializations_updated_at ON specializations;
CREATE TRIGGER specializations_updated_at
    BEFORE UPDATE ON specializations
    FOR EACH ROW
    EXECUTE FUNCTION update_specializations_updated_at();
