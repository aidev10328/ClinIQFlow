-- Migration 020: Data Scoping Rules
-- Controls what DATA each hospital role can see (complements RBAC page-level access)
-- ============================================================

-- ─── 1. Create data_scoping_rules table ───────────────────────
CREATE TABLE IF NOT EXISTS data_scoping_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL,
    data_domain TEXT NOT NULL,
    scope_type TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role, data_domain)
);

-- ─── 2. Updated_at trigger (reuse existing function) ──────────
DROP TRIGGER IF EXISTS update_data_scoping_rules_updated_at ON data_scoping_rules;
CREATE TRIGGER update_data_scoping_rules_updated_at
    BEFORE UPDATE ON data_scoping_rules
    FOR EACH ROW EXECUTE FUNCTION update_rbac_updated_at();

-- ─── 3. RLS policies ─────────────────────────────────────────
ALTER TABLE data_scoping_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "data_scoping_rules_select" ON data_scoping_rules
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "data_scoping_rules_all" ON data_scoping_rules
    FOR ALL TO service_role USING (true);

GRANT ALL ON data_scoping_rules TO service_role;

-- ─── 4. Seed default rules ───────────────────────────────────
-- HOSPITAL_MANAGER: full hospital access
INSERT INTO data_scoping_rules (role, data_domain, scope_type, description) VALUES
  ('HOSPITAL_MANAGER', 'doctors',      'all_hospital',   'Manager sees all doctors'),
  ('HOSPITAL_MANAGER', 'patients',     'all_hospital',   'Manager sees all patients'),
  ('HOSPITAL_MANAGER', 'appointments', 'all_hospital',   'Manager sees all appointments'),
  ('HOSPITAL_MANAGER', 'schedule',     'all_hospital',   'Manager sees all schedules'),
  ('HOSPITAL_MANAGER', 'metrics',      'hospital_wide',  'Manager sees hospital-wide metrics'),
  ('HOSPITAL_MANAGER', 'staff',        'all_hospital',   'Manager sees all staff')
ON CONFLICT (role, data_domain) DO NOTHING;

-- DOCTOR: self-scoped
INSERT INTO data_scoping_rules (role, data_domain, scope_type, description) VALUES
  ('DOCTOR', 'doctors',      'self_only',        'Doctor sees only own profile'),
  ('DOCTOR', 'patients',     'by_doctor_scope',  'Doctor sees own patients'),
  ('DOCTOR', 'appointments', 'by_doctor_scope',  'Doctor sees own appointments'),
  ('DOCTOR', 'schedule',     'self_only',        'Doctor sees own schedule'),
  ('DOCTOR', 'metrics',      'self_only',        'Doctor sees own metrics'),
  ('DOCTOR', 'staff',        'same_doctors',     'Doctor sees staff assigned to them')
ON CONFLICT (role, data_domain) DO NOTHING;

-- HOSPITAL_STAFF: assigned-doctor scoped
INSERT INTO data_scoping_rules (role, data_domain, scope_type, description) VALUES
  ('HOSPITAL_STAFF', 'doctors',      'assigned_only',    'Staff sees assigned doctors only'),
  ('HOSPITAL_STAFF', 'patients',     'by_doctor_scope',  'Staff sees patients of assigned doctors'),
  ('HOSPITAL_STAFF', 'appointments', 'by_doctor_scope',  'Staff sees appointments of assigned doctors'),
  ('HOSPITAL_STAFF', 'schedule',     'by_doctor_scope',  'Staff sees schedules of assigned doctors'),
  ('HOSPITAL_STAFF', 'metrics',      'by_doctor_scope',  'Staff sees metrics of assigned doctors'),
  ('HOSPITAL_STAFF', 'staff',        'same_doctors',     'Staff sees colleagues with same doctors')
ON CONFLICT (role, data_domain) DO NOTHING;

-- PATIENT: own-record scoped
INSERT INTO data_scoping_rules (role, data_domain, scope_type, description) VALUES
  ('PATIENT', 'doctors',      'none',          'Patient cannot see doctor list'),
  ('PATIENT', 'patients',     'self_record',   'Patient sees only own record'),
  ('PATIENT', 'appointments', 'self_only',     'Patient sees only own appointments'),
  ('PATIENT', 'schedule',     'none',          'Patient cannot see schedules'),
  ('PATIENT', 'metrics',      'self_only',     'Patient sees only own metrics'),
  ('PATIENT', 'staff',        'none',          'Patient cannot see staff')
ON CONFLICT (role, data_domain) DO NOTHING;
