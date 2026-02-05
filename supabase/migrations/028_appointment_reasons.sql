-- ============================================================
-- 028: Appointment Reasons (admin-managed lookup table)
-- ============================================================

CREATE TABLE IF NOT EXISTS appointment_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE appointment_reasons IS 'Admin-managed lookup table for appointment/queue visit reasons';

-- Index for fetching active reasons (used in dropdowns)
CREATE INDEX IF NOT EXISTS idx_appointment_reasons_active
  ON appointment_reasons (sort_order ASC) WHERE is_active = true;

-- Auto-update updated_at
CREATE TRIGGER set_appointment_reasons_updated_at
  BEFORE UPDATE ON appointment_reasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grants
GRANT ALL ON appointment_reasons TO service_role;
GRANT SELECT ON appointment_reasons TO authenticated;

-- Seed data: common visit reasons
INSERT INTO appointment_reasons (name, description, sort_order) VALUES
  ('Consultation',        'General medical consultation',      1),
  ('Follow-up',           'Follow-up visit for ongoing care',  2),
  ('New Visit',           'First-time patient visit',          3),
  ('Second Opinion',      'Seeking additional medical opinion', 4),
  ('Lab Results Review',  'Review of laboratory test results', 5),
  ('Vaccination',         'Immunization or vaccination',       6),
  ('Annual Checkup',      'Routine annual health examination', 7),
  ('Prescription Refill', 'Renewal of existing prescription',  8),
  ('Emergency',           'Urgent or emergency visit',         9),
  ('Other',               'Other reason not listed above',     10)
ON CONFLICT (name) DO NOTHING;
