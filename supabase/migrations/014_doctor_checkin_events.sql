-- =====================================================
-- Migration 014: Doctor Check-in/Check-out Events
-- =====================================================
-- Stores individual check-in and check-out events
-- Allows multiple check-ins/check-outs per day

-- Event type enum
CREATE TYPE checkin_event_type AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- =====================================================
-- Doctor Check-in Events Table
-- =====================================================
CREATE TABLE doctor_checkin_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    doctor_profile_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
    event_date DATE NOT NULL,
    event_type checkin_event_type NOT NULL,
    event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- Indexes
-- =====================================================
CREATE INDEX idx_doctor_checkin_events_hospital ON doctor_checkin_events(hospital_id);
CREATE INDEX idx_doctor_checkin_events_doctor ON doctor_checkin_events(doctor_profile_id);
CREATE INDEX idx_doctor_checkin_events_date ON doctor_checkin_events(event_date);
CREATE INDEX idx_doctor_checkin_events_doctor_date ON doctor_checkin_events(doctor_profile_id, event_date);

-- =====================================================
-- RLS Policies
-- =====================================================
ALTER TABLE doctor_checkin_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view checkin events for their hospital"
    ON doctor_checkin_events FOR SELECT
    USING (
        hospital_id IN (
            SELECT hospital_id FROM hospital_memberships
            WHERE user_id = auth.uid() AND status = 'ACTIVE'
        )
    );

CREATE POLICY "Users can manage checkin events for their hospital"
    ON doctor_checkin_events FOR ALL
    USING (
        hospital_id IN (
            SELECT hospital_id FROM hospital_memberships
            WHERE user_id = auth.uid() AND status = 'ACTIVE'
        )
    );
