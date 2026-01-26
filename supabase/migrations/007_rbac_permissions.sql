-- =============================================
-- RBAC (Role-Based Access Control) Schema
-- =============================================
-- Provides configurable permissions for:
-- 1. Page/resource access per role
-- 2. Actions (view, add, edit, delete) per resource
-- 3. Field-level permissions within pages
-- =============================================

-- =============================================
-- RBAC Resources Table
-- Defines pages/modules that can have permissions
-- =============================================
CREATE TABLE IF NOT EXISTS rbac_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,           -- e.g., 'admin.hospitals', 'hospital.doctors'
    name TEXT NOT NULL,                   -- Human-readable name
    description TEXT,                     -- Description of the resource
    category TEXT NOT NULL DEFAULT 'hospital', -- 'admin' or 'hospital'
    path_pattern TEXT,                    -- URL pattern (e.g., '/admin/hospitals/*')
    parent_code TEXT REFERENCES rbac_resources(code) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- RBAC Resource Actions Table
-- Defines available actions for each resource
-- =============================================
CREATE TABLE IF NOT EXISTS rbac_resource_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES rbac_resources(id) ON DELETE CASCADE,
    action TEXT NOT NULL,                 -- 'view', 'add', 'edit', 'delete'
    name TEXT NOT NULL,                   -- Human-readable name
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(resource_id, action)
);

-- =============================================
-- RBAC Resource Fields Table
-- Defines field-level permissions for resources
-- =============================================
CREATE TABLE IF NOT EXISTS rbac_resource_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES rbac_resources(id) ON DELETE CASCADE,
    field_code TEXT NOT NULL,             -- e.g., 'hospitalName', 'billingInfo'
    field_name TEXT NOT NULL,             -- Human-readable name
    field_type TEXT DEFAULT 'field',      -- 'field' or 'section'
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(resource_id, field_code)
);

-- =============================================
-- RBAC Role Permissions Table
-- Default permissions for each role (system-wide)
-- =============================================
CREATE TABLE IF NOT EXISTS rbac_role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL,                   -- 'SUPER_ADMIN', 'HOSPITAL_MANAGER', 'DOCTOR'
    resource_id UUID NOT NULL REFERENCES rbac_resources(id) ON DELETE CASCADE,
    allowed_actions TEXT[] DEFAULT '{}',  -- Array of allowed actions
    field_permissions JSONB DEFAULT '{}', -- {"viewable": ["field1"], "editable": ["field2"]}
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role, resource_id)
);

-- =============================================
-- RBAC Hospital Role Overrides Table
-- Per-hospital permission customizations
-- =============================================
CREATE TABLE IF NOT EXISTS rbac_hospital_role_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    resource_id UUID NOT NULL REFERENCES rbac_resources(id) ON DELETE CASCADE,
    allowed_actions TEXT[] DEFAULT '{}',
    field_permissions JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(hospital_id, role, resource_id)
);

-- =============================================
-- RBAC User Permissions Table
-- User-specific permission overrides
-- =============================================
CREATE TABLE IF NOT EXISTS rbac_user_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    hospital_id UUID REFERENCES hospitals(id) ON DELETE CASCADE, -- NULL for global
    resource_id UUID NOT NULL REFERENCES rbac_resources(id) ON DELETE CASCADE,
    allowed_actions TEXT[] DEFAULT '{}',
    denied_actions TEXT[] DEFAULT '{}',   -- Explicitly denied actions
    field_permissions JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, hospital_id, resource_id)
);

-- =============================================
-- Indexes for performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_rbac_resources_code ON rbac_resources(code);
CREATE INDEX IF NOT EXISTS idx_rbac_resources_category ON rbac_resources(category);
CREATE INDEX IF NOT EXISTS idx_rbac_role_permissions_role ON rbac_role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_rbac_hospital_overrides_hospital ON rbac_hospital_role_overrides(hospital_id);
CREATE INDEX IF NOT EXISTS idx_rbac_hospital_overrides_role ON rbac_hospital_role_overrides(role);
CREATE INDEX IF NOT EXISTS idx_rbac_user_permissions_user ON rbac_user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_rbac_user_permissions_hospital ON rbac_user_permissions(hospital_id);

-- =============================================
-- Updated at trigger function
-- =============================================
CREATE OR REPLACE FUNCTION update_rbac_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS update_rbac_resources_updated_at ON rbac_resources;
CREATE TRIGGER update_rbac_resources_updated_at
    BEFORE UPDATE ON rbac_resources
    FOR EACH ROW EXECUTE FUNCTION update_rbac_updated_at();

DROP TRIGGER IF EXISTS update_rbac_role_permissions_updated_at ON rbac_role_permissions;
CREATE TRIGGER update_rbac_role_permissions_updated_at
    BEFORE UPDATE ON rbac_role_permissions
    FOR EACH ROW EXECUTE FUNCTION update_rbac_updated_at();

DROP TRIGGER IF EXISTS update_rbac_hospital_overrides_updated_at ON rbac_hospital_role_overrides;
CREATE TRIGGER update_rbac_hospital_overrides_updated_at
    BEFORE UPDATE ON rbac_hospital_role_overrides
    FOR EACH ROW EXECUTE FUNCTION update_rbac_updated_at();

DROP TRIGGER IF EXISTS update_rbac_user_permissions_updated_at ON rbac_user_permissions;
CREATE TRIGGER update_rbac_user_permissions_updated_at
    BEFORE UPDATE ON rbac_user_permissions
    FOR EACH ROW EXECUTE FUNCTION update_rbac_updated_at();

-- =============================================
-- SEED DATA: Resources
-- =============================================

-- Admin Resources
INSERT INTO rbac_resources (code, name, description, category, path_pattern, sort_order) VALUES
    ('admin.dashboard', 'Admin Dashboard', 'Main admin dashboard with overview metrics', 'admin', '/admin', 10),
    ('admin.hospitals', 'Hospitals Management', 'View and manage all hospitals', 'admin', '/admin/hospitals/*', 20),
    ('admin.revenue', 'Revenue Dashboard', 'Platform-wide revenue analytics', 'admin', '/admin/revenue', 30),
    ('admin.products', 'Products Management', 'Manage subscription products and pricing', 'admin', '/admin/products/*', 40),
    ('admin.subscriptions', 'Subscriptions Management', 'View and manage hospital subscriptions', 'admin', '/admin/subscriptions/*', 50),
    ('admin.discounts', 'Discounts Management', 'Manage discount codes and promotions', 'admin', '/admin/discounts/*', 60),
    ('admin.compliance', 'Compliance Documents', 'Manage legal and compliance documents', 'admin', '/admin/compliance/*', 70),
    ('admin.system', 'System Settings', 'Platform-wide system configuration', 'admin', '/admin/system', 80),
    ('admin.rbac', 'Access Control (RBAC)', 'Configure roles and permissions', 'admin', '/admin/rbac', 90)
ON CONFLICT (code) DO NOTHING;

-- Hospital Resources
INSERT INTO rbac_resources (code, name, description, category, path_pattern, sort_order) VALUES
    ('hospital.dashboard', 'Hospital Dashboard', 'Hospital-specific dashboard with metrics', 'hospital', '/hospital', 100),
    ('hospital.doctors', 'Doctors Management', 'View and manage hospital doctors', 'hospital', '/hospital/doctors', 110),
    ('hospital.doctors.detail', 'Doctor Details', 'View and edit individual doctor profiles', 'hospital', '/hospital/doctors/*', 115),
    ('hospital.patients', 'Patients Management', 'View and manage patient records', 'hospital', '/hospital/patients/*', 120),
    ('hospital.staff', 'Staff Management', 'View and manage hospital staff', 'hospital', '/hospital/staff', 130),
    ('hospital.licenses', 'License Management', 'Manage subscription and licenses', 'hospital', '/hospital/licenses/*', 140),
    ('hospital.billing', 'Billing & Invoices', 'View billing history and invoices', 'hospital', '/hospital/billing', 150),
    ('hospital.settings', 'Hospital Settings', 'Configure hospital settings', 'hospital', '/hospital/settings', 160)
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- SEED DATA: Resource Actions
-- =============================================

-- Helper function to insert actions for resources
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Admin resources get all CRUD actions
    FOR r IN SELECT id, code FROM rbac_resources WHERE category = 'admin'
    LOOP
        INSERT INTO rbac_resource_actions (resource_id, action, name, description) VALUES
            (r.id, 'view', 'View', 'Can view this resource'),
            (r.id, 'add', 'Add', 'Can add new items'),
            (r.id, 'edit', 'Edit', 'Can edit existing items'),
            (r.id, 'delete', 'Delete', 'Can delete items')
        ON CONFLICT (resource_id, action) DO NOTHING;
    END LOOP;

    -- Hospital resources get all CRUD actions
    FOR r IN SELECT id, code FROM rbac_resources WHERE category = 'hospital'
    LOOP
        INSERT INTO rbac_resource_actions (resource_id, action, name, description) VALUES
            (r.id, 'view', 'View', 'Can view this resource'),
            (r.id, 'add', 'Add', 'Can add new items'),
            (r.id, 'edit', 'Edit', 'Can edit existing items'),
            (r.id, 'delete', 'Delete', 'Can delete items')
        ON CONFLICT (resource_id, action) DO NOTHING;
    END LOOP;
END $$;

-- =============================================
-- SEED DATA: Resource Fields (for field-level permissions)
-- =============================================

-- Hospital Settings fields
INSERT INTO rbac_resource_fields (resource_id, field_code, field_name, field_type, description)
SELECT id, 'basicInfo', 'Basic Information', 'section', 'Hospital name, address, contact info'
FROM rbac_resources WHERE code = 'hospital.settings'
ON CONFLICT (resource_id, field_code) DO NOTHING;

INSERT INTO rbac_resource_fields (resource_id, field_code, field_name, field_type, description)
SELECT id, 'billingInfo', 'Billing Information', 'section', 'Payment methods and billing address'
FROM rbac_resources WHERE code = 'hospital.settings'
ON CONFLICT (resource_id, field_code) DO NOTHING;

INSERT INTO rbac_resource_fields (resource_id, field_code, field_name, field_type, description)
SELECT id, 'regionalSettings', 'Regional Settings', 'section', 'Timezone, currency, and locale'
FROM rbac_resources WHERE code = 'hospital.settings'
ON CONFLICT (resource_id, field_code) DO NOTHING;

-- Doctor Details fields
INSERT INTO rbac_resource_fields (resource_id, field_code, field_name, field_type, description)
SELECT id, 'personalInfo', 'Personal Information', 'section', 'Name, contact, specialty'
FROM rbac_resources WHERE code = 'hospital.doctors.detail'
ON CONFLICT (resource_id, field_code) DO NOTHING;

INSERT INTO rbac_resource_fields (resource_id, field_code, field_name, field_type, description)
SELECT id, 'schedule', 'Schedule', 'section', 'Working hours and availability'
FROM rbac_resources WHERE code = 'hospital.doctors.detail'
ON CONFLICT (resource_id, field_code) DO NOTHING;

INSERT INTO rbac_resource_fields (resource_id, field_code, field_name, field_type, description)
SELECT id, 'compensation', 'Compensation', 'section', 'Salary and payment information'
FROM rbac_resources WHERE code = 'hospital.doctors.detail'
ON CONFLICT (resource_id, field_code) DO NOTHING;

-- Patient fields
INSERT INTO rbac_resource_fields (resource_id, field_code, field_name, field_type, description)
SELECT id, 'demographics', 'Demographics', 'section', 'Personal and contact information'
FROM rbac_resources WHERE code = 'hospital.patients'
ON CONFLICT (resource_id, field_code) DO NOTHING;

INSERT INTO rbac_resource_fields (resource_id, field_code, field_name, field_type, description)
SELECT id, 'medicalHistory', 'Medical History', 'section', 'Health records and conditions'
FROM rbac_resources WHERE code = 'hospital.patients'
ON CONFLICT (resource_id, field_code) DO NOTHING;

INSERT INTO rbac_resource_fields (resource_id, field_code, field_name, field_type, description)
SELECT id, 'insurance', 'Insurance Information', 'section', 'Insurance and billing details'
FROM rbac_resources WHERE code = 'hospital.patients'
ON CONFLICT (resource_id, field_code) DO NOTHING;

-- =============================================
-- SEED DATA: Default Role Permissions
-- =============================================

-- SUPER_ADMIN gets full access to everything (but we still record it for consistency)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM rbac_resources
    LOOP
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('SUPER_ADMIN', r.id, ARRAY['view', 'add', 'edit', 'delete'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END LOOP;
END $$;

-- HOSPITAL_MANAGER permissions
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Hospital Dashboard - view only
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.dashboard';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', r.id, ARRAY['view'], '{"viewable": ["*"], "editable": []}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END IF;

    -- Doctors - full CRUD
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.doctors';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', r.id, ARRAY['view', 'add', 'edit', 'delete'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END IF;

    -- Doctor Details - view and edit
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.doctors.detail';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', r.id, ARRAY['view', 'edit'], '{"viewable": ["*"], "editable": ["personalInfo", "schedule", "compensation"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END IF;

    -- Patients - full CRUD
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.patients';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', r.id, ARRAY['view', 'add', 'edit', 'delete'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END IF;

    -- Staff - full CRUD
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.staff';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', r.id, ARRAY['view', 'add', 'edit', 'delete'], '{"viewable": ["*"], "editable": ["*"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END IF;

    -- Licenses - view, add, delete
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.licenses';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', r.id, ARRAY['view', 'add', 'delete'], '{"viewable": ["*"], "editable": []}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END IF;

    -- Billing - view only
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.billing';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', r.id, ARRAY['view'], '{"viewable": ["*"], "editable": []}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END IF;

    -- Settings - view and edit
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.settings';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('HOSPITAL_MANAGER', r.id, ARRAY['view', 'edit'], '{"viewable": ["*"], "editable": ["basicInfo", "regionalSettings"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END IF;
END $$;

-- DOCTOR permissions
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Hospital Dashboard - view only
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.dashboard';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('DOCTOR', r.id, ARRAY['view'], '{"viewable": ["*"], "editable": []}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END IF;

    -- Doctor Details (own profile) - view and limited edit
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.doctors.detail';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('DOCTOR', r.id, ARRAY['view', 'edit'], '{"viewable": ["personalInfo", "schedule"], "editable": ["schedule"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END IF;

    -- Patients - view, add, edit (but not delete)
    SELECT id INTO r FROM rbac_resources WHERE code = 'hospital.patients';
    IF r.id IS NOT NULL THEN
        INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
        VALUES ('DOCTOR', r.id, ARRAY['view', 'add', 'edit'], '{"viewable": ["demographics", "medicalHistory"], "editable": ["medicalHistory"]}')
        ON CONFLICT (role, resource_id) DO NOTHING;
    END IF;
END $$;

-- =============================================
-- RLS Policies
-- =============================================

-- Enable RLS
ALTER TABLE rbac_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac_resource_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac_resource_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac_hospital_role_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac_user_permissions ENABLE ROW LEVEL SECURITY;

-- Resources - readable by all authenticated users
CREATE POLICY "rbac_resources_select" ON rbac_resources
    FOR SELECT TO authenticated USING (true);

-- Resource actions - readable by all authenticated users
CREATE POLICY "rbac_resource_actions_select" ON rbac_resource_actions
    FOR SELECT TO authenticated USING (true);

-- Resource fields - readable by all authenticated users
CREATE POLICY "rbac_resource_fields_select" ON rbac_resource_fields
    FOR SELECT TO authenticated USING (true);

-- Role permissions - readable by all, writable by super admins
CREATE POLICY "rbac_role_permissions_select" ON rbac_role_permissions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "rbac_role_permissions_all" ON rbac_role_permissions
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.is_super_admin = true
        )
    );

-- Hospital overrides - readable by hospital members, writable by super admins
CREATE POLICY "rbac_hospital_overrides_select" ON rbac_hospital_role_overrides
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM hospital_memberships
            WHERE hospital_memberships.hospital_id = rbac_hospital_role_overrides.hospital_id
            AND hospital_memberships.user_id = auth.uid()
            AND hospital_memberships.status = 'ACTIVE'
        )
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.is_super_admin = true
        )
    );

CREATE POLICY "rbac_hospital_overrides_all" ON rbac_hospital_role_overrides
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.is_super_admin = true
        )
    );

-- User permissions - users can see their own, super admins can see/edit all
CREATE POLICY "rbac_user_permissions_select" ON rbac_user_permissions
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.is_super_admin = true
        )
    );

CREATE POLICY "rbac_user_permissions_all" ON rbac_user_permissions
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.is_super_admin = true
        )
    );

-- Grant service role full access
GRANT ALL ON rbac_resources TO service_role;
GRANT ALL ON rbac_resource_actions TO service_role;
GRANT ALL ON rbac_resource_fields TO service_role;
GRANT ALL ON rbac_role_permissions TO service_role;
GRANT ALL ON rbac_hospital_role_overrides TO service_role;
GRANT ALL ON rbac_user_permissions TO service_role;
