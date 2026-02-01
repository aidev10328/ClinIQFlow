-- ============================================================================
-- ClinQflow Step 25: WhatsApp Notification Logging
-- Migration: 025_whatsapp_notifications
-- ============================================================================

-- ============================================================================
-- 1. WHATSAPP NOTIFICATIONS LOG TABLE
-- ============================================================================

CREATE TABLE whatsapp_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    patient_id UUID NULL REFERENCES patients(id) ON DELETE SET NULL,
    recipient_phone TEXT NOT NULL,
    template_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    wa_message_id TEXT NULL,
    error_message TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT valid_wa_status CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed'))
);

-- Indexes
CREATE INDEX idx_wa_notifications_hospital_id ON whatsapp_notifications(hospital_id);
CREATE INDEX idx_wa_notifications_patient_id ON whatsapp_notifications(patient_id);
CREATE INDEX idx_wa_notifications_status ON whatsapp_notifications(status);
CREATE INDEX idx_wa_notifications_created_at ON whatsapp_notifications(created_at DESC);

-- ============================================================================
-- 2. ENABLE RLS
-- ============================================================================

ALTER TABLE whatsapp_notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================

-- Super admins can see all notifications
CREATE POLICY "Super admins full access to wa notifications"
    ON whatsapp_notifications FOR ALL
    USING (current_user_is_super_admin());

-- Hospital managers can read notifications for their hospital
CREATE POLICY "Managers can read wa notifications"
    ON whatsapp_notifications FOR SELECT
    USING (
        is_hospital_manager(auth.uid(), hospital_id)
    );

-- Service role (admin client) can insert notifications
-- No explicit policy needed since we use getAdminClient() which bypasses RLS
