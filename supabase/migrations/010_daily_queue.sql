-- =====================================================
-- Migration 010: Daily Queue / Walk-in System
-- =====================================================
-- Manages daily walk-in patients and scheduled appointment check-ins
-- Queue resets daily and doesn't carry over to next day

-- Queue entry status enum
CREATE TYPE queue_entry_status AS ENUM (
    'QUEUED',       -- In the queue waiting to be called
    'WAITING',      -- Called and in waiting room
    'WITH_DOCTOR',  -- Currently with the doctor
    'COMPLETED',    -- Visit completed
    'NO_SHOW',      -- Patient didn't show up
    'LEFT'          -- Patient left before being seen
);

-- Queue entry type enum
CREATE TYPE queue_entry_type AS ENUM (
    'WALK_IN',      -- Walk-in patient without appointment
    'SCHEDULED'     -- Scheduled appointment that checked in
);

-- Queue priority enum
CREATE TYPE queue_priority AS ENUM (
    'NORMAL',       -- Normal priority
    'URGENT',       -- Urgent case
    'EMERGENCY'     -- Emergency - highest priority
);

-- Doctor daily status enum
CREATE TYPE doctor_daily_status AS ENUM (
    'NOT_CHECKED_IN',
    'CHECKED_IN',
    'ON_BREAK',
    'CHECKED_OUT'
);

-- =====================================================
-- Doctor Daily Check-in Table
-- =====================================================
-- Tracks doctor's daily check-in/out status
CREATE TABLE doctor_daily_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    doctor_profile_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
    checkin_date DATE NOT NULL,
    status doctor_daily_status NOT NULL DEFAULT 'NOT_CHECKED_IN',
    checked_in_at TIMESTAMPTZ,
    checked_out_at TIMESTAMPTZ,
    break_start_at TIMESTAMPTZ,
    break_end_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(doctor_profile_id, checkin_date)
);

-- =====================================================
-- Queue Entries Table
-- =====================================================
-- Stores all queue entries for the day
CREATE TABLE queue_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    doctor_profile_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,

    -- Queue information
    queue_date DATE NOT NULL,
    queue_number INTEGER NOT NULL,
    entry_type queue_entry_type NOT NULL DEFAULT 'WALK_IN',
    status queue_entry_status NOT NULL DEFAULT 'QUEUED',
    priority queue_priority NOT NULL DEFAULT 'NORMAL',

    -- For walk-ins without registered patient record
    walk_in_name VARCHAR(255),
    walk_in_phone VARCHAR(50),
    reason_for_visit TEXT,

    -- Timestamps for tracking
    checked_in_at TIMESTAMPTZ DEFAULT now(),
    called_at TIMESTAMPTZ,
    with_doctor_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Additional info
    notes TEXT,
    wait_time_minutes INTEGER, -- Calculated when completed
    consultation_time_minutes INTEGER, -- Calculated when completed

    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(doctor_profile_id, queue_date, queue_number)
);

-- =====================================================
-- Indexes
-- =====================================================
CREATE INDEX idx_doctor_daily_checkins_hospital ON doctor_daily_checkins(hospital_id);
CREATE INDEX idx_doctor_daily_checkins_date ON doctor_daily_checkins(checkin_date);
CREATE INDEX idx_doctor_daily_checkins_doctor_date ON doctor_daily_checkins(doctor_profile_id, checkin_date);

CREATE INDEX idx_queue_entries_hospital ON queue_entries(hospital_id);
CREATE INDEX idx_queue_entries_doctor ON queue_entries(doctor_profile_id);
CREATE INDEX idx_queue_entries_date ON queue_entries(queue_date);
CREATE INDEX idx_queue_entries_doctor_date ON queue_entries(doctor_profile_id, queue_date);
CREATE INDEX idx_queue_entries_status ON queue_entries(status);
CREATE INDEX idx_queue_entries_patient ON queue_entries(patient_id);

-- =====================================================
-- Trigger to update updated_at
-- =====================================================
CREATE TRIGGER update_doctor_daily_checkins_updated_at
    BEFORE UPDATE ON doctor_daily_checkins
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_queue_entries_updated_at
    BEFORE UPDATE ON queue_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Function to get next queue number for a doctor on a date
-- =====================================================
CREATE OR REPLACE FUNCTION get_next_queue_number(
    p_doctor_profile_id UUID,
    p_queue_date DATE
) RETURNS INTEGER AS $$
DECLARE
    next_number INTEGER;
BEGIN
    SELECT COALESCE(MAX(queue_number), 0) + 1 INTO next_number
    FROM queue_entries
    WHERE doctor_profile_id = p_doctor_profile_id
    AND queue_date = p_queue_date;

    RETURN next_number;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- RLS Policies
-- =====================================================
ALTER TABLE doctor_daily_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_entries ENABLE ROW LEVEL SECURITY;

-- Policies for doctor_daily_checkins
CREATE POLICY "Users can view checkins for their hospital"
    ON doctor_daily_checkins FOR SELECT
    USING (
        hospital_id IN (
            SELECT hospital_id FROM hospital_memberships
            WHERE user_id = auth.uid() AND status = 'ACTIVE'
        )
    );

CREATE POLICY "Users can manage checkins for their hospital"
    ON doctor_daily_checkins FOR ALL
    USING (
        hospital_id IN (
            SELECT hospital_id FROM hospital_memberships
            WHERE user_id = auth.uid() AND status = 'ACTIVE'
        )
    );

-- Policies for queue_entries
CREATE POLICY "Users can view queue for their hospital"
    ON queue_entries FOR SELECT
    USING (
        hospital_id IN (
            SELECT hospital_id FROM hospital_memberships
            WHERE user_id = auth.uid() AND status = 'ACTIVE'
        )
    );

CREATE POLICY "Users can manage queue for their hospital"
    ON queue_entries FOR ALL
    USING (
        hospital_id IN (
            SELECT hospital_id FROM hospital_memberships
            WHERE user_id = auth.uid() AND status = 'ACTIVE'
        )
    );

-- =====================================================
-- RBAC Resource for Queue
-- =====================================================
INSERT INTO rbac_resources (code, name, description, category, path_pattern, sort_order)
VALUES ('hospital.queue', 'Daily Queue', 'Manage daily patient queue', 'hospital', '/hospital/queue/*', 126)
ON CONFLICT (code) DO NOTHING;

-- Add actions and permissions for the queue resource
DO $$
DECLARE
    queue_resource_id UUID;
BEGIN
    SELECT id INTO queue_resource_id FROM rbac_resources WHERE code = 'hospital.queue';

    IF queue_resource_id IS NOT NULL THEN
        -- Add actions
        INSERT INTO rbac_resource_actions (resource_id, action, name, description) VALUES
            (queue_resource_id, 'view', 'View', 'Can view the queue'),
            (queue_resource_id, 'add', 'Add', 'Can add to queue'),
            (queue_resource_id, 'edit', 'Edit', 'Can edit queue entries'),
            (queue_resource_id, 'delete', 'Delete', 'Can remove from queue')
        ON CONFLICT (resource_id, action) DO NOTHING;

        -- Manager: full access
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', queue_resource_id, ARRAY['view', 'add', 'edit', 'delete'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;

        -- Staff: view, add, edit (manage queue)
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('STAFF', queue_resource_id, ARRAY['view', 'add', 'edit'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;

        -- Doctor: view and edit (their own queue)
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('DOCTOR', queue_resource_id, ARRAY['view', 'edit'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END IF;
END $$;
