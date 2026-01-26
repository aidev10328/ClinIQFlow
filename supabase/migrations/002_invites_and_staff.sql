-- ============================================================================
-- ClinQflow Step 2: Invitations and Staff Authentication
-- Migration: 002_invites_and_staff
-- ============================================================================

-- ============================================================================
-- 1. HOSPITAL INVITES TABLE
-- ============================================================================

CREATE TABLE hospital_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    invited_email TEXT NOT NULL,
    role app_role NOT NULL,
    invited_by_user_id UUID NOT NULL REFERENCES auth.users(id),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    used_at TIMESTAMPTZ NULL,
    used_by_user_id UUID NULL REFERENCES auth.users(id),
    status TEXT NOT NULL DEFAULT 'PENDING',
    metadata JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
    CONSTRAINT valid_invite_role CHECK (role IN ('HOSPITAL_MANAGER', 'DOCTOR'))
);

-- Indexes
CREATE INDEX idx_hospital_invites_token_hash ON hospital_invites(token_hash);
CREATE INDEX idx_hospital_invites_hospital_id ON hospital_invites(hospital_id);
CREATE INDEX idx_hospital_invites_email ON hospital_invites(invited_email);
CREATE INDEX idx_hospital_invites_status ON hospital_invites(status);

-- ============================================================================
-- 2. STAFF SESSIONS TABLE (for JWT validation/revocation)
-- ============================================================================

CREATE TABLE staff_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE,
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_sessions_token_hash ON staff_sessions(token_hash);
CREATE INDEX idx_staff_sessions_staff_id ON staff_sessions(staff_id);

-- ============================================================================
-- 3. HELPER FUNCTIONS
-- ============================================================================

-- Check if invite is valid (not expired, not used, not revoked)
CREATE OR REPLACE FUNCTION is_invite_valid(invite_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM hospital_invites
        WHERE id = invite_id
        AND status = 'PENDING'
        AND expires_at > now()
    )
$$;

-- Get invite by token hash
CREATE OR REPLACE FUNCTION get_invite_by_token_hash(t_hash TEXT)
RETURNS TABLE (
    id UUID,
    hospital_id UUID,
    invited_email TEXT,
    role app_role,
    status TEXT,
    expires_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT
        hi.id,
        hi.hospital_id,
        hi.invited_email,
        hi.role,
        hi.status,
        hi.expires_at
    FROM hospital_invites hi
    WHERE hi.token_hash = t_hash
$$;

-- ============================================================================
-- 4. ENABLE RLS
-- ============================================================================

ALTER TABLE hospital_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. RLS POLICIES - HOSPITAL_INVITES
-- ============================================================================

-- Super admins can do everything
CREATE POLICY "Super admins full access to invites"
    ON hospital_invites FOR ALL
    USING (current_user_is_super_admin());

-- Hospital managers can read invites for their hospital
CREATE POLICY "Managers can read hospital invites"
    ON hospital_invites FOR SELECT
    USING (
        is_hospital_manager(auth.uid(), hospital_id)
    );

-- Hospital managers can create doctor invites for their hospital
CREATE POLICY "Managers can create doctor invites"
    ON hospital_invites FOR INSERT
    WITH CHECK (
        is_hospital_manager(auth.uid(), hospital_id)
        AND role = 'DOCTOR'
        AND invited_by_user_id = auth.uid()
    );

-- Hospital managers can update (revoke) invites in their hospital
CREATE POLICY "Managers can update hospital invites"
    ON hospital_invites FOR UPDATE
    USING (
        is_hospital_manager(auth.uid(), hospital_id)
    )
    WITH CHECK (
        is_hospital_manager(auth.uid(), hospital_id)
    );

-- ============================================================================
-- 6. RLS POLICIES - STAFF_SESSIONS
-- ============================================================================

-- Super admins can see all sessions
CREATE POLICY "Super admins full access to staff sessions"
    ON staff_sessions FOR ALL
    USING (current_user_is_super_admin());

-- Hospital managers can see sessions in their hospital
CREATE POLICY "Managers can read staff sessions"
    ON staff_sessions FOR SELECT
    USING (
        is_hospital_manager(auth.uid(), hospital_id)
    );

-- Hospital managers can revoke sessions in their hospital
CREATE POLICY "Managers can update staff sessions"
    ON staff_sessions FOR UPDATE
    USING (
        is_hospital_manager(auth.uid(), hospital_id)
    );

-- ============================================================================
-- 7. UPDATE staff_accounts IF NEEDED
-- ============================================================================

-- Ensure staff_accounts has all required fields (idempotent)
DO $$
BEGIN
    -- Add phone column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'staff_accounts' AND column_name = 'phone'
    ) THEN
        ALTER TABLE staff_accounts ADD COLUMN phone TEXT;
    END IF;

    -- Add email column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'staff_accounts' AND column_name = 'email'
    ) THEN
        ALTER TABLE staff_accounts ADD COLUMN email TEXT;
    END IF;
END $$;

-- ============================================================================
-- 8. FUNCTION TO ACCEPT INVITE (called via API with service role)
-- ============================================================================

-- This function handles the atomic accept operation
-- It should be called from API after validating the user
CREATE OR REPLACE FUNCTION accept_invite(
    p_invite_id UUID,
    p_user_id UUID,
    p_user_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite hospital_invites%ROWTYPE;
    v_hospital_id UUID;
    v_role app_role;
    v_membership_id UUID;
    v_is_primary BOOLEAN;
BEGIN
    -- Lock and get invite
    SELECT * INTO v_invite
    FROM hospital_invites
    WHERE id = p_invite_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invite not found');
    END IF;

    -- Validate invite
    IF v_invite.status != 'PENDING' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invite already used or revoked');
    END IF;

    IF v_invite.expires_at < now() THEN
        -- Mark as expired
        UPDATE hospital_invites SET status = 'EXPIRED' WHERE id = p_invite_id;
        RETURN jsonb_build_object('success', false, 'error', 'Invite has expired');
    END IF;

    -- Validate email matches (case-insensitive)
    IF lower(v_invite.invited_email) != lower(p_user_email) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Email does not match invite');
    END IF;

    v_hospital_id := v_invite.hospital_id;
    v_role := v_invite.role;

    -- Upsert profile
    INSERT INTO profiles (user_id, email, full_name)
    VALUES (p_user_id, p_user_email, p_user_email)
    ON CONFLICT (user_id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = now();

    -- Check if this should be primary (for managers, if no other primary exists)
    v_is_primary := false;
    IF v_role = 'HOSPITAL_MANAGER' THEN
        SELECT NOT EXISTS (
            SELECT 1 FROM hospital_memberships
            WHERE hospital_id = v_hospital_id
            AND role = 'HOSPITAL_MANAGER'
            AND is_primary = true
            AND status = 'ACTIVE'
        ) INTO v_is_primary;
    END IF;

    -- Upsert membership
    INSERT INTO hospital_memberships (hospital_id, user_id, role, is_primary, status)
    VALUES (v_hospital_id, p_user_id, v_role, v_is_primary, 'ACTIVE')
    ON CONFLICT (hospital_id, user_id) DO UPDATE SET
        role = EXCLUDED.role,
        status = 'ACTIVE',
        updated_at = now()
    RETURNING id INTO v_membership_id;

    -- Mark invite as accepted
    UPDATE hospital_invites SET
        status = 'ACCEPTED',
        used_at = now(),
        used_by_user_id = p_user_id
    WHERE id = p_invite_id;

    RETURN jsonb_build_object(
        'success', true,
        'membership_id', v_membership_id,
        'hospital_id', v_hospital_id,
        'role', v_role::text,
        'is_primary', v_is_primary
    );
END;
$$;

-- ============================================================================
-- 9. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Additional indexes for common queries
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_hospital_memberships_role ON hospital_memberships(role);

-- ============================================================================
-- 10. CLEANUP EXPIRED INVITES (optional scheduled function)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_invites()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE hospital_invites
    SET status = 'EXPIRED'
    WHERE status = 'PENDING'
    AND expires_at < now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;
