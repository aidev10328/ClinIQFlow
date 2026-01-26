-- ============================================================================
-- ClinQflow Step 9: Appointments Management
-- Migration: 009_appointments.sql
-- ============================================================================

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE slot_status AS ENUM ('AVAILABLE', 'BOOKED', 'BLOCKED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE slot_period AS ENUM ('MORNING', 'EVENING', 'NIGHT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE appointment_status AS ENUM (
        'SCHEDULED',
        'CONFIRMED',
        'COMPLETED',
        'CANCELLED',
        'NO_SHOW'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 2. ALTER doctor_profiles - Add appointment duration
-- ============================================================================

ALTER TABLE doctor_profiles
ADD COLUMN IF NOT EXISTS appointment_duration_minutes INTEGER DEFAULT 30;

-- Add constraint if not exists
DO $$ BEGIN
    ALTER TABLE doctor_profiles
    ADD CONSTRAINT valid_appointment_duration
    CHECK (appointment_duration_minutes IN (15, 20, 30, 45, 60));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 3. APPOINTMENT SLOTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS appointment_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    doctor_profile_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,

    -- Slot timing
    slot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL,

    -- Period classification (for UI grouping)
    period slot_period NOT NULL,

    -- Status
    status slot_status NOT NULL DEFAULT 'AVAILABLE',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    UNIQUE(doctor_profile_id, slot_date, start_time)
);

-- ============================================================================
-- 4. APPOINTMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    slot_id UUID NOT NULL REFERENCES appointment_slots(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_profile_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,

    -- Appointment details
    appointment_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,

    -- Status
    status appointment_status NOT NULL DEFAULT 'SCHEDULED',

    -- Notes
    reason_for_visit TEXT,
    notes TEXT,
    cancellation_reason TEXT,

    -- Booking info
    booked_by_user_id UUID REFERENCES auth.users(id),
    booked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One appointment per slot
    UNIQUE(slot_id)
);

-- ============================================================================
-- 5. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_appointment_slots_hospital ON appointment_slots(hospital_id);
CREATE INDEX IF NOT EXISTS idx_appointment_slots_doctor ON appointment_slots(doctor_profile_id);
CREATE INDEX IF NOT EXISTS idx_appointment_slots_date ON appointment_slots(slot_date);
CREATE INDEX IF NOT EXISTS idx_appointment_slots_status ON appointment_slots(status);
CREATE INDEX IF NOT EXISTS idx_appointment_slots_lookup ON appointment_slots(doctor_profile_id, slot_date, status);

CREATE INDEX IF NOT EXISTS idx_appointments_hospital ON appointments(hospital_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_profile_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_lookup ON appointments(doctor_profile_id, appointment_date, status);

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

CREATE OR REPLACE TRIGGER update_appointment_slots_updated_at
    BEFORE UPDATE ON appointment_slots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_appointments_updated_at
    BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. RLS POLICIES
-- ============================================================================

ALTER TABLE appointment_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins full access to appointment_slots" ON appointment_slots;
DROP POLICY IF EXISTS "Hospital managers can manage appointment_slots" ON appointment_slots;
DROP POLICY IF EXISTS "Doctors can view and manage own slots" ON appointment_slots;
DROP POLICY IF EXISTS "Hospital members can view slots" ON appointment_slots;

DROP POLICY IF EXISTS "Super admins full access to appointments" ON appointments;
DROP POLICY IF EXISTS "Hospital managers can manage appointments" ON appointments;
DROP POLICY IF EXISTS "Doctors can manage own appointments" ON appointments;
DROP POLICY IF EXISTS "Hospital members can view appointments" ON appointments;

-- Appointment Slots Policies
CREATE POLICY "Super admins full access to appointment_slots"
    ON appointment_slots FOR ALL
    USING (current_user_is_super_admin());

CREATE POLICY "Hospital managers can manage appointment_slots"
    ON appointment_slots FOR ALL
    USING (is_hospital_manager(auth.uid(), hospital_id));

CREATE POLICY "Doctors can view and manage own slots"
    ON appointment_slots FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM doctor_profiles dp
            WHERE dp.id = appointment_slots.doctor_profile_id
            AND dp.user_id = auth.uid()
        )
    );

CREATE POLICY "Hospital members can view slots"
    ON appointment_slots FOR SELECT
    USING (user_has_membership(auth.uid(), hospital_id));

-- Appointments Policies
CREATE POLICY "Super admins full access to appointments"
    ON appointments FOR ALL
    USING (current_user_is_super_admin());

CREATE POLICY "Hospital managers can manage appointments"
    ON appointments FOR ALL
    USING (is_hospital_manager(auth.uid(), hospital_id));

CREATE POLICY "Doctors can manage own appointments"
    ON appointments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM doctor_profiles dp
            WHERE dp.id = appointments.doctor_profile_id
            AND dp.user_id = auth.uid()
        )
    );

CREATE POLICY "Hospital members can view appointments"
    ON appointments FOR SELECT
    USING (user_has_membership(auth.uid(), hospital_id));

-- ============================================================================
-- 8. HELPER FUNCTIONS
-- ============================================================================

-- Function to determine period from time
CREATE OR REPLACE FUNCTION get_slot_period(p_time TIME)
RETURNS slot_period
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_time >= '06:00' AND p_time < '12:00' THEN 'MORNING'::slot_period
        WHEN p_time >= '12:00' AND p_time < '22:00' THEN 'EVENING'::slot_period
        ELSE 'NIGHT'::slot_period
    END;
$$;

-- Function to check if date falls within doctor's approved time-off
CREATE OR REPLACE FUNCTION is_doctor_on_time_off(
    p_doctor_profile_id UUID,
    p_date DATE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM doctor_time_off
        WHERE doctor_profile_id = p_doctor_profile_id
        AND status = 'approved'
        AND p_date BETWEEN start_date AND end_date
    );
$$;

-- ============================================================================
-- 9. RBAC RESOURCES FOR APPOINTMENTS
-- ============================================================================

INSERT INTO rbac_resources (code, name, description, category, path_pattern, sort_order) VALUES
    ('hospital.appointments', 'Appointments Management', 'Manage patient appointments and scheduling', 'hospital', '/hospital/appointments/*', 125)
ON CONFLICT (code) DO NOTHING;

-- Add actions for appointments resource
DO $$
DECLARE
    r RECORD;
BEGIN
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.appointments';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_resource_actions (resource_id, action, name, description) VALUES
            (r.id, 'view', 'View', 'Can view appointments'),
            (r.id, 'add', 'Add', 'Can create appointments'),
            (r.id, 'edit', 'Edit', 'Can edit appointments'),
            (r.id, 'delete', 'Delete', 'Can cancel appointments'),
            (r.id, 'generate', 'Generate Slots', 'Can generate appointment slots')
        ON CONFLICT (resource_id, action) DO NOTHING;
    END IF;
END $$;

-- HOSPITAL_MANAGER permissions for appointments (full access including generate)
DO $$
DECLARE
    r RECORD;
BEGIN
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.appointments';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', r.id, ARRAY['view', 'add', 'edit', 'delete', 'generate'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO UPDATE SET allowed_actions = EXCLUDED.allowed_actions;
    END IF;
END $$;

-- DOCTOR permissions for appointments (view and manage own, no generate)
DO $$
DECLARE
    r RECORD;
BEGIN
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.appointments';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('DOCTOR', r.id, ARRAY['view', 'add', 'edit'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO UPDATE SET allowed_actions = EXCLUDED.allowed_actions;
    END IF;
END $$;

-- STAFF permissions for appointments (view and add only, for assigned doctors)
DO $$
DECLARE
    r RECORD;
BEGIN
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.appointments';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('STAFF', r.id, ARRAY['view', 'add'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO UPDATE SET allowed_actions = EXCLUDED.allowed_actions;
    END IF;
END $$;

-- ============================================================================
-- 10. GRANTS
-- ============================================================================

GRANT USAGE ON TYPE slot_status TO authenticated;
GRANT USAGE ON TYPE slot_period TO authenticated;
GRANT USAGE ON TYPE appointment_status TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON appointment_slots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON appointments TO authenticated;

GRANT ALL ON appointment_slots TO service_role;
GRANT ALL ON appointments TO service_role;
