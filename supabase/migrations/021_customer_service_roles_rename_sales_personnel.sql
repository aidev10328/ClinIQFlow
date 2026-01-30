-- Migration 021: Add Customer Service roles, rename SALES_PERSON → SALES_PERSONNEL
-- ============================================================

-- ─── 1. Rename SALES_PERSON → SALES_PERSONNEL ────────────────
UPDATE rbac_role_permissions
SET role = 'SALES_PERSONNEL'
WHERE role = 'SALES_PERSON';

UPDATE rbac_hospital_role_overrides
SET role = 'SALES_PERSONNEL'
WHERE role = 'SALES_PERSON';

UPDATE data_scoping_rules
SET role = 'SALES_PERSONNEL'
WHERE role = 'SALES_PERSON';

-- ─── 2. CUSTOMER_SERVICE_MANAGER RBAC permissions ────────────
-- CS Manager can view admin dashboard, hospitals, and has full access
-- to customer-facing support areas (subscriptions, products, compliance)

-- admin.dashboard — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_MANAGER', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code IN ('admin.dashboard')
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.dashboard children — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_MANAGER', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code LIKE 'admin.dashboard.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.hospitals — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_MANAGER', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code = 'admin.hospitals'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.hospitals children — view + edit (can assist hospitals)
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_MANAGER', r.id, ARRAY['view', 'edit']
FROM rbac_resources r
WHERE r.code LIKE 'admin.hospitals.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.subscriptions — view + edit (can manage subscription issues)
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_MANAGER', r.id, ARRAY['view', 'edit']
FROM rbac_resources r
WHERE r.code = 'admin.subscriptions'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.subscriptions children — view + edit
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_MANAGER', r.id, ARRAY['view', 'edit']
FROM rbac_resources r
WHERE r.code LIKE 'admin.subscriptions.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.products — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_MANAGER', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code = 'admin.products'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.products children — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_MANAGER', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code LIKE 'admin.products.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.compliance — view + edit (can help with compliance issues)
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_MANAGER', r.id, ARRAY['view', 'edit']
FROM rbac_resources r
WHERE r.code = 'admin.compliance'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.compliance children — view + edit
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_MANAGER', r.id, ARRAY['view', 'edit']
FROM rbac_resources r
WHERE r.code LIKE 'admin.compliance.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;


-- ─── 3. CUSTOMER_SERVICE_PERSONNEL RBAC permissions ──────────
-- CS Personnel has more limited access:
-- admin.dashboard (view), admin.hospitals (view),
-- admin.subscriptions (view), admin.products (view),
-- admin.compliance (view)

-- admin.dashboard — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_PERSONNEL', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code = 'admin.dashboard'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_PERSONNEL' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.dashboard children — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_PERSONNEL', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code LIKE 'admin.dashboard.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_PERSONNEL' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.hospitals — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_PERSONNEL', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code = 'admin.hospitals'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_PERSONNEL' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.hospitals children — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_PERSONNEL', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code LIKE 'admin.hospitals.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_PERSONNEL' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.subscriptions — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_PERSONNEL', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code = 'admin.subscriptions'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_PERSONNEL' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.subscriptions children — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_PERSONNEL', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code LIKE 'admin.subscriptions.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_PERSONNEL' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.products — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_PERSONNEL', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code = 'admin.products'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_PERSONNEL' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.products children — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_PERSONNEL', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code LIKE 'admin.products.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_PERSONNEL' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.compliance — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_PERSONNEL', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code = 'admin.compliance'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_PERSONNEL' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.compliance children — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'CUSTOMER_SERVICE_PERSONNEL', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code LIKE 'admin.compliance.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'CUSTOMER_SERVICE_PERSONNEL' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;


-- ─── 4. Data Scoping Rules for new/renamed roles ────────────
-- SALES_MANAGER: admin-level role, no hospital data access
INSERT INTO data_scoping_rules (role, data_domain, scope_type, description) VALUES
  ('SALES_MANAGER', 'doctors',      'none', 'Sales Manager does not access hospital doctor data'),
  ('SALES_MANAGER', 'patients',     'none', 'Sales Manager does not access patient data'),
  ('SALES_MANAGER', 'appointments', 'none', 'Sales Manager does not access appointment data'),
  ('SALES_MANAGER', 'schedule',     'none', 'Sales Manager does not access schedule data'),
  ('SALES_MANAGER', 'metrics',      'none', 'Sales Manager does not access hospital metrics'),
  ('SALES_MANAGER', 'staff',        'none', 'Sales Manager does not access staff data')
ON CONFLICT (role, data_domain) DO NOTHING;

-- SALES_PERSONNEL (was SALES_PERSON, already renamed above): admin-level role, no hospital data access
INSERT INTO data_scoping_rules (role, data_domain, scope_type, description) VALUES
  ('SALES_PERSONNEL', 'doctors',      'none', 'Sales Personnel does not access hospital doctor data'),
  ('SALES_PERSONNEL', 'patients',     'none', 'Sales Personnel does not access patient data'),
  ('SALES_PERSONNEL', 'appointments', 'none', 'Sales Personnel does not access appointment data'),
  ('SALES_PERSONNEL', 'schedule',     'none', 'Sales Personnel does not access schedule data'),
  ('SALES_PERSONNEL', 'metrics',      'none', 'Sales Personnel does not access hospital metrics'),
  ('SALES_PERSONNEL', 'staff',        'none', 'Sales Personnel does not access staff data')
ON CONFLICT (role, data_domain) DO NOTHING;

-- CUSTOMER_SERVICE_MANAGER: can view all hospital data for support purposes
INSERT INTO data_scoping_rules (role, data_domain, scope_type, description) VALUES
  ('CUSTOMER_SERVICE_MANAGER', 'doctors',      'all_hospital', 'CS Manager can see all doctors for support'),
  ('CUSTOMER_SERVICE_MANAGER', 'patients',     'all_hospital', 'CS Manager can see all patients for support'),
  ('CUSTOMER_SERVICE_MANAGER', 'appointments', 'all_hospital', 'CS Manager can see all appointments'),
  ('CUSTOMER_SERVICE_MANAGER', 'schedule',     'all_hospital', 'CS Manager can see all schedules'),
  ('CUSTOMER_SERVICE_MANAGER', 'metrics',      'hospital_wide', 'CS Manager sees hospital-wide metrics'),
  ('CUSTOMER_SERVICE_MANAGER', 'staff',        'all_hospital', 'CS Manager can see all staff')
ON CONFLICT (role, data_domain) DO NOTHING;

-- CUSTOMER_SERVICE_PERSONNEL: limited hospital data access for support
INSERT INTO data_scoping_rules (role, data_domain, scope_type, description) VALUES
  ('CUSTOMER_SERVICE_PERSONNEL', 'doctors',      'all_hospital', 'CS Personnel can see doctors for support'),
  ('CUSTOMER_SERVICE_PERSONNEL', 'patients',     'all_hospital', 'CS Personnel can see patients for support'),
  ('CUSTOMER_SERVICE_PERSONNEL', 'appointments', 'all_hospital', 'CS Personnel can see appointments for support'),
  ('CUSTOMER_SERVICE_PERSONNEL', 'schedule',     'none',         'CS Personnel does not access schedules'),
  ('CUSTOMER_SERVICE_PERSONNEL', 'metrics',      'none',         'CS Personnel does not access metrics'),
  ('CUSTOMER_SERVICE_PERSONNEL', 'staff',        'none',         'CS Personnel does not access staff data')
ON CONFLICT (role, data_domain) DO NOTHING;
