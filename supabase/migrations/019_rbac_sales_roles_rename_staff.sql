-- Migration 019: Rename STAFF → HOSPITAL_STAFF, add SALES_MANAGER & SALES_PERSON roles
-- ============================================================

-- ─── 1. Rename STAFF → HOSPITAL_STAFF in role_permissions ───
UPDATE rbac_role_permissions
SET role = 'HOSPITAL_STAFF'
WHERE role = 'STAFF';

-- Also rename in hospital_role_overrides if any exist
UPDATE rbac_hospital_role_overrides
SET role = 'HOSPITAL_STAFF'
WHERE role = 'STAFF';

-- Note: rbac_user_permissions has no role column, so no rename needed there.

-- ─── 2. Insert SALES_MANAGER permissions ───────────────────
-- Sales Manager has access to admin sales-related pages:
--   admin.dashboard (view), admin.hospitals (view),
--   admin.revenue (full), admin.products (full),
--   admin.subscriptions (full), admin.discounts (full)

-- admin.dashboard — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_MANAGER', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code IN (
  'admin.dashboard'
)
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.dashboard children — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_MANAGER', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code LIKE 'admin.dashboard.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.hospitals — view only (can see hospitals list)
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_MANAGER', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code = 'admin.hospitals'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.hospitals children — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_MANAGER', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code LIKE 'admin.hospitals.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.revenue — full access (view, add, edit, delete)
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_MANAGER', r.id, ARRAY['view', 'add', 'edit', 'delete']
FROM rbac_resources r
WHERE r.code = 'admin.revenue'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.revenue children — full access
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_MANAGER', r.id, ARRAY['view', 'add', 'edit', 'delete']
FROM rbac_resources r
WHERE r.code LIKE 'admin.revenue.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.products — full access
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_MANAGER', r.id, ARRAY['view', 'add', 'edit', 'delete']
FROM rbac_resources r
WHERE r.code = 'admin.products'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.products children — full access
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_MANAGER', r.id, ARRAY['view', 'add', 'edit', 'delete']
FROM rbac_resources r
WHERE r.code LIKE 'admin.products.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.subscriptions — full access
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_MANAGER', r.id, ARRAY['view', 'add', 'edit', 'delete']
FROM rbac_resources r
WHERE r.code = 'admin.subscriptions'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.subscriptions children — full access
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_MANAGER', r.id, ARRAY['view', 'add', 'edit', 'delete']
FROM rbac_resources r
WHERE r.code LIKE 'admin.subscriptions.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.discounts — full access
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_MANAGER', r.id, ARRAY['view', 'add', 'edit', 'delete']
FROM rbac_resources r
WHERE r.code = 'admin.discounts'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.discounts children — full access
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_MANAGER', r.id, ARRAY['view', 'add', 'edit', 'delete']
FROM rbac_resources r
WHERE r.code LIKE 'admin.discounts.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_MANAGER' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;


-- ─── 3. Insert SALES_PERSON permissions ────────────────────
-- Sales Person has more limited access:
--   admin.dashboard (view), admin.hospitals (view),
--   admin.revenue (view only), admin.products (view only),
--   admin.subscriptions (view + add), admin.discounts (view only)

-- admin.dashboard — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_PERSON', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code = 'admin.dashboard'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_PERSON' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.dashboard children — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_PERSON', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code LIKE 'admin.dashboard.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_PERSON' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.hospitals — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_PERSON', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code = 'admin.hospitals'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_PERSON' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.hospitals children — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_PERSON', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code LIKE 'admin.hospitals.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_PERSON' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.revenue — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_PERSON', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code = 'admin.revenue'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_PERSON' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.revenue children — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_PERSON', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code LIKE 'admin.revenue.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_PERSON' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.products — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_PERSON', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code = 'admin.products'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_PERSON' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.products children — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_PERSON', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code LIKE 'admin.products.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_PERSON' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.subscriptions — view + add (can create subscriptions)
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_PERSON', r.id, ARRAY['view', 'add']
FROM rbac_resources r
WHERE r.code = 'admin.subscriptions'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_PERSON' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.subscriptions children — view + add
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_PERSON', r.id, ARRAY['view', 'add']
FROM rbac_resources r
WHERE r.code LIKE 'admin.subscriptions.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_PERSON' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.discounts — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_PERSON', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code = 'admin.discounts'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_PERSON' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;

-- admin.discounts children — view only
INSERT INTO rbac_role_permissions (role, resource_id, allowed_actions)
SELECT 'SALES_PERSON', r.id, ARRAY['view']
FROM rbac_resources r
WHERE r.code LIKE 'admin.discounts.%'
AND NOT EXISTS (
  SELECT 1 FROM rbac_role_permissions rp
  WHERE rp.role = 'SALES_PERSON' AND rp.resource_id = r.id
)
ON CONFLICT DO NOTHING;
