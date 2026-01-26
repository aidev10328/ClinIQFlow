-- Migration: Staff Authentication Unification
-- Migrate staff from custom JWT auth to Supabase auth

-- 1. Add STAFF to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'STAFF';

-- 2. Add assigned_doctor_ids to hospital_memberships for staff doctor assignment
ALTER TABLE hospital_memberships
ADD COLUMN IF NOT EXISTS assigned_doctor_ids UUID[] DEFAULT NULL;

COMMENT ON COLUMN hospital_memberships.assigned_doctor_ids IS
'For STAFF role: NULL means all doctors, array of UUIDs means specific doctors only';

-- 3. Insert STAFF role permissions into RBAC system
-- First, check if resources exist before inserting permissions

-- STAFF can view hospital dashboard
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
SELECT 'STAFF', id, ARRAY['view'], '{}'::jsonb
FROM rbac_resources WHERE code = 'hospital.dashboard'
ON CONFLICT (role, resource_id) DO NOTHING;

-- STAFF can view doctors list (no edit)
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
SELECT 'STAFF', id, ARRAY['view'], '{}'::jsonb
FROM rbac_resources WHERE code = 'hospital.doctors'
ON CONFLICT (role, resource_id) DO NOTHING;

-- STAFF can view doctor details
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
SELECT 'STAFF', id, ARRAY['view'], '{}'::jsonb
FROM rbac_resources WHERE code = 'hospital.doctors.detail'
ON CONFLICT (role, resource_id) DO NOTHING;

-- STAFF has full CRUD on patients
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
SELECT 'STAFF', id, ARRAY['view', 'add', 'edit', 'delete'], '{}'::jsonb
FROM rbac_resources WHERE code = 'hospital.patients'
ON CONFLICT (role, resource_id) DO NOTHING;

-- STAFF can view settings (no edit)
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions, field_permissions)
SELECT 'STAFF', id, ARRAY['view'], '{}'::jsonb
FROM rbac_resources WHERE code = 'hospital.settings'
ON CONFLICT (role, resource_id) DO NOTHING;

-- 4. Rename old staff_accounts table (keep for reference during migration)
-- Check if table exists before renaming
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'staff_accounts') THEN
        ALTER TABLE staff_accounts RENAME TO staff_accounts_deprecated;
    END IF;
END $$;

-- 5. Also rename staff_sessions if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'staff_sessions') THEN
        ALTER TABLE staff_sessions RENAME TO staff_sessions_deprecated;
    END IF;
END $$;
