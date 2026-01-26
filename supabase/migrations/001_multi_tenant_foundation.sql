-- ============================================================================
-- ClinQflow Multi-Tenant Foundation with Supabase RLS
-- Migration: 001_multi_tenant_foundation
-- ============================================================================

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

CREATE TYPE app_role AS ENUM ('SUPER_ADMIN', 'HOSPITAL_MANAGER', 'DOCTOR');
CREATE TYPE hospital_region AS ENUM ('US', 'UK', 'IN');

-- ============================================================================
-- 2. TABLES
-- ============================================================================

-- Hospitals table
CREATE TABLE hospitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    state TEXT,
    postal TEXT,
    country TEXT NOT NULL,
    region hospital_region NOT NULL,
    currency TEXT NOT NULL,
    timezone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles table (maps auth.users -> app profile)
CREATE TABLE profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    is_super_admin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hospital memberships (user <-> hospital association with role)
CREATE TABLE hospital_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(hospital_id, user_id)
);

-- Staff accounts (placeholder - no auth wiring yet)
CREATE TABLE staff_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(hospital_id, username)
);

-- Indexes for performance
CREATE INDEX idx_hospital_memberships_user_id ON hospital_memberships(user_id);
CREATE INDEX idx_hospital_memberships_hospital_id ON hospital_memberships(hospital_id);
CREATE INDEX idx_staff_accounts_hospital_id ON staff_accounts(hospital_id);

-- ============================================================================
-- 3. HELPER FUNCTIONS
-- ============================================================================

-- Get current authenticated user ID
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT auth.uid()
$$;

-- Check if a user is a super admin
CREATE OR REPLACE FUNCTION is_super_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT COALESCE(
        (SELECT is_super_admin FROM profiles WHERE user_id = uid),
        false
    )
$$;

-- Check if current user is super admin
CREATE OR REPLACE FUNCTION current_user_is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT is_super_admin(auth.uid())
$$;

-- Check if user has membership in a hospital
CREATE OR REPLACE FUNCTION user_has_membership(uid UUID, h_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM hospital_memberships
        WHERE user_id = uid
        AND hospital_id = h_id
        AND status = 'ACTIVE'
    )
$$;

-- Get user's role in a hospital (returns NULL if no membership)
CREATE OR REPLACE FUNCTION user_role_in_hospital(uid UUID, h_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT role FROM hospital_memberships
    WHERE user_id = uid
    AND hospital_id = h_id
    AND status = 'ACTIVE'
    LIMIT 1
$$;

-- Check if user is hospital manager in a specific hospital
CREATE OR REPLACE FUNCTION is_hospital_manager(uid UUID, h_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT user_role_in_hospital(uid, h_id) = 'HOSPITAL_MANAGER'
$$;

-- ============================================================================
-- 4. AUTO-CREATE PROFILE ON USER SIGNUP
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO profiles (user_id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    );
    RETURN NEW;
END;
$$;

-- Trigger to auto-create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- 5. UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_hospitals_updated_at
    BEFORE UPDATE ON hospitals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hospital_memberships_updated_at
    BEFORE UPDATE ON hospital_memberships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. ENABLE RLS
-- ============================================================================

ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospital_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_accounts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7. RLS POLICIES - PROFILES
-- ============================================================================

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
    ON profiles FOR SELECT
    USING (user_id = auth.uid());

-- Users can update their own profile (but not is_super_admin)
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (
        user_id = auth.uid()
        AND is_super_admin = (SELECT p.is_super_admin FROM profiles p WHERE p.user_id = auth.uid())
    );

-- Super admins can read all profiles
CREATE POLICY "Super admins can read all profiles"
    ON profiles FOR SELECT
    USING (current_user_is_super_admin());

-- Super admins can update all profiles
CREATE POLICY "Super admins can update all profiles"
    ON profiles FOR UPDATE
    USING (current_user_is_super_admin());

-- ============================================================================
-- 8. RLS POLICIES - HOSPITALS
-- ============================================================================

-- Super admins can do everything with hospitals
CREATE POLICY "Super admins full access to hospitals"
    ON hospitals FOR ALL
    USING (current_user_is_super_admin());

-- Users can read hospitals they have membership in
CREATE POLICY "Members can read their hospitals"
    ON hospitals FOR SELECT
    USING (
        user_has_membership(auth.uid(), id)
    );

-- ============================================================================
-- 9. RLS POLICIES - HOSPITAL_MEMBERSHIPS
-- ============================================================================

-- Super admins can do everything with memberships
CREATE POLICY "Super admins full access to memberships"
    ON hospital_memberships FOR ALL
    USING (current_user_is_super_admin());

-- Users can read their own memberships
CREATE POLICY "Users can read own memberships"
    ON hospital_memberships FOR SELECT
    USING (user_id = auth.uid());

-- Hospital managers can read all memberships in their hospital
CREATE POLICY "Hospital managers can read hospital memberships"
    ON hospital_memberships FOR SELECT
    USING (
        is_hospital_manager(auth.uid(), hospital_id)
    );

-- Hospital managers can insert doctor memberships in their hospital
CREATE POLICY "Hospital managers can add doctors"
    ON hospital_memberships FOR INSERT
    WITH CHECK (
        is_hospital_manager(auth.uid(), hospital_id)
        AND role = 'DOCTOR'
    );

-- Hospital managers can update doctor memberships in their hospital
CREATE POLICY "Hospital managers can update doctor memberships"
    ON hospital_memberships FOR UPDATE
    USING (
        is_hospital_manager(auth.uid(), hospital_id)
        AND role = 'DOCTOR'
    )
    WITH CHECK (
        is_hospital_manager(auth.uid(), hospital_id)
        AND role = 'DOCTOR'
    );

-- Hospital managers can delete doctor memberships in their hospital
CREATE POLICY "Hospital managers can remove doctors"
    ON hospital_memberships FOR DELETE
    USING (
        is_hospital_manager(auth.uid(), hospital_id)
        AND role = 'DOCTOR'
    );

-- ============================================================================
-- 10. RLS POLICIES - STAFF_ACCOUNTS
-- ============================================================================

-- Super admins can do everything with staff accounts
CREATE POLICY "Super admins full access to staff accounts"
    ON staff_accounts FOR ALL
    USING (current_user_is_super_admin());

-- Hospital managers can manage staff in their hospital
CREATE POLICY "Hospital managers can manage staff"
    ON staff_accounts FOR ALL
    USING (is_hospital_manager(auth.uid(), hospital_id));

-- ============================================================================
-- 11. SEED DATA
-- ============================================================================

-- Insert demo hospital
INSERT INTO hospitals (name, country, region, currency, timezone, city, state)
VALUES (
    'Demo Hospital US',
    'USA',
    'US',
    'USD',
    'America/Chicago',
    'Chicago',
    'IL'
);

-- ============================================================================
-- 12. POST-SETUP INSTRUCTIONS
-- ============================================================================

/*
IMPORTANT: After running this migration:

1. Sign up a new user via Supabase Auth (email/password or magic link)

2. To make that user a Super Admin, run:

   UPDATE profiles
   SET is_super_admin = true
   WHERE email = 'your-admin-email@example.com';

3. To add a user to a hospital as Hospital Manager:

   INSERT INTO hospital_memberships (hospital_id, user_id, role, is_primary)
   SELECT
       (SELECT id FROM hospitals WHERE name = 'Demo Hospital US'),
       (SELECT user_id FROM profiles WHERE email = 'your-email@example.com'),
       'HOSPITAL_MANAGER',
       true;

4. To add a user as a Doctor:

   INSERT INTO hospital_memberships (hospital_id, user_id, role, is_primary)
   SELECT
       (SELECT id FROM hospitals WHERE name = 'Demo Hospital US'),
       (SELECT user_id FROM profiles WHERE email = 'doctor@example.com'),
       'DOCTOR',
       true;
*/
