-- ============================================================
-- Migration 004: Products, Pricing, Subscriptions, Licenses, Discounts
-- Feature gating for multi-tenant SaaS billing model
-- ============================================================

-- ============================================================
-- 1. ENUMS
-- ============================================================

-- Product codes (extensible)
CREATE TYPE product_code AS ENUM (
  'APPOINTMENTS',
  'CLINIQ_BRIEF'
);

-- Subscription status
CREATE TYPE subscription_status AS ENUM (
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED'
);

-- License status
CREATE TYPE license_status AS ENUM (
  'ACTIVE',
  'INACTIVE'
);

-- Discount types
CREATE TYPE discount_type AS ENUM (
  'PERCENT',
  'FIXED',
  'FREE_MONTHS'
);

-- ============================================================
-- 2. TABLES
-- ============================================================

-- Products catalog
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code product_code UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Product pricing per region/currency
CREATE TABLE product_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  region hospital_region NOT NULL,
  currency TEXT NOT NULL,
  price_per_doctor_monthly NUMERIC(12,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, region, currency, effective_at)
);

-- Discount codes (Super Admin defined)
CREATE TABLE discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  type discount_type NOT NULL,
  value NUMERIC(12,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_uses INTEGER NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NULL,
  region hospital_region NULL,
  applicable_product_ids UUID[] NULL,
  conditions JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hospital subscriptions (one per hospital)
CREATE TABLE hospital_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  status subscription_status NOT NULL,
  region hospital_region NOT NULL,
  currency TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trial_ends_at TIMESTAMPTZ NULL,
  renews_at TIMESTAMPTZ NULL,
  canceled_at TIMESTAMPTZ NULL,
  discount_code_id UUID NULL REFERENCES discount_codes(id),
  snapshot JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(hospital_id)
);

-- Subscription line items (products in subscription)
CREATE TABLE hospital_subscription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES hospital_subscriptions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  unit_price NUMERIC(12,2) NOT NULL,
  quantity_doctors INTEGER NOT NULL DEFAULT 0,
  status subscription_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(subscription_id, product_id)
);

-- Doctor product licenses
CREATE TABLE doctor_product_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  doctor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  status license_status NOT NULL DEFAULT 'ACTIVE',
  assigned_by_user_id UUID NULL REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ NULL,
  UNIQUE(hospital_id, doctor_user_id, product_id)
);

-- Discount redemptions
CREATE TABLE discount_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_code_id UUID NOT NULL REFERENCES discount_codes(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  redeemed_by_user_id UUID NULL REFERENCES auth.users(id),
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot JSONB NULL,
  UNIQUE(discount_code_id, hospital_id)
);

-- ============================================================
-- 3. INDEXES
-- ============================================================

CREATE INDEX idx_product_pricing_lookup
  ON product_pricing(product_id, region, is_active, effective_at DESC);

CREATE INDEX idx_hospital_subscriptions_status
  ON hospital_subscriptions(status, renews_at);

CREATE INDEX idx_subscription_items_lookup
  ON hospital_subscription_items(subscription_id, product_id, status);

CREATE INDEX idx_doctor_licenses_lookup
  ON doctor_product_licenses(hospital_id, doctor_user_id, product_id, status);

CREATE INDEX idx_discount_codes_active
  ON discount_codes(code, is_active, expires_at);

-- ============================================================
-- 4. TRIGGERS FOR updated_at
-- ============================================================

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_discount_codes_updated_at
  BEFORE UPDATE ON discount_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hospital_subscriptions_updated_at
  BEFORE UPDATE ON hospital_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_items_updated_at
  BEFORE UPDATE ON hospital_subscription_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 5. HELPER FUNCTIONS
-- ============================================================

-- Get hospital's region and currency mapping
CREATE OR REPLACE FUNCTION get_hospital_region_currency(p_hospital_id UUID)
RETURNS TABLE(region hospital_region, currency TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    h.region,
    CASE h.region
      WHEN 'US' THEN 'USD'
      WHEN 'UK' THEN 'GBP'
      WHEN 'IN' THEN 'INR'
      ELSE 'USD'
    END as currency
  FROM hospitals h
  WHERE h.id = p_hospital_id;
$$;

-- Check if hospital has active subscription for a product
CREATE OR REPLACE FUNCTION active_subscription_item(p_hospital_id UUID, p_product_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM hospital_subscriptions hs
    JOIN hospital_subscription_items hsi ON hsi.subscription_id = hs.id
    WHERE hs.hospital_id = p_hospital_id
      AND hsi.product_id = p_product_id
      AND hs.status IN ('TRIAL', 'ACTIVE')
      AND hsi.status IN ('TRIAL', 'ACTIVE')
      AND (hs.trial_ends_at IS NULL OR hs.trial_ends_at > now() OR hs.status = 'ACTIVE')
  );
$$;

-- Check if doctor has active license for a product in a hospital
CREATE OR REPLACE FUNCTION doctor_has_active_license(
  p_hospital_id UUID,
  p_doctor_user_id UUID,
  p_product_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM doctor_product_licenses
    WHERE hospital_id = p_hospital_id
      AND doctor_user_id = p_doctor_user_id
      AND product_id = p_product_id
      AND status = 'ACTIVE'
  );
$$;

-- Main entitlement check: can user access a product in a hospital?
CREATE OR REPLACE FUNCTION can_access_product(
  p_hospital_id UUID,
  p_user_id UUID,
  p_product_code product_code
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_user_role app_role;
  v_is_super_admin BOOLEAN;
  v_product_id UUID;
  v_has_subscription BOOLEAN;
  v_has_license BOOLEAN;
BEGIN
  -- Check if super admin (bypasses all checks)
  SELECT is_super_admin INTO v_is_super_admin
  FROM profiles WHERE id = p_user_id;

  IF v_is_super_admin = true THEN
    RETURN true;
  END IF;

  -- Get user's role in the hospital
  SELECT role INTO v_user_role
  FROM hospital_memberships
  WHERE user_id = p_user_id
    AND hospital_id = p_hospital_id
    AND status = 'ACTIVE';

  IF v_user_role IS NULL THEN
    RETURN false; -- Not a member of this hospital
  END IF;

  -- Get product ID from code
  SELECT id INTO v_product_id
  FROM products
  WHERE code = p_product_code AND is_active = true;

  IF v_product_id IS NULL THEN
    RETURN false; -- Product doesn't exist or inactive
  END IF;

  -- Check if hospital has active subscription for this product
  v_has_subscription := active_subscription_item(p_hospital_id, v_product_id);

  IF NOT v_has_subscription THEN
    RETURN false; -- Hospital doesn't have subscription
  END IF;

  -- For HOSPITAL_MANAGER: subscription is enough (no license required)
  IF v_user_role = 'HOSPITAL_MANAGER' THEN
    RETURN true;
  END IF;

  -- For DOCTOR: must have active license
  IF v_user_role = 'DOCTOR' THEN
    v_has_license := doctor_has_active_license(p_hospital_id, p_user_id, v_product_id);
    RETURN v_has_license;
  END IF;

  -- Other roles: deny by default
  RETURN false;
END;
$$;

-- Get all product entitlements for a user in a hospital
CREATE OR REPLACE FUNCTION get_user_entitlements(p_hospital_id UUID, p_user_id UUID)
RETURNS TABLE(
  product_id UUID,
  product_code product_code,
  product_name TEXT,
  has_access BOOLEAN,
  has_license BOOLEAN,
  subscription_status subscription_status,
  unit_price NUMERIC(12,2)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_user_role app_role;
  v_is_super_admin BOOLEAN;
BEGIN
  -- Check if super admin
  SELECT is_super_admin INTO v_is_super_admin
  FROM profiles WHERE id = p_user_id;

  -- Get user's role
  SELECT role INTO v_user_role
  FROM hospital_memberships
  WHERE user_id = p_user_id
    AND hospital_id = p_hospital_id
    AND status = 'ACTIVE';

  RETURN QUERY
  SELECT
    p.id as product_id,
    p.code as product_code,
    p.name as product_name,
    -- Has access if super admin, or subscription active and (manager or has license)
    CASE
      WHEN v_is_super_admin = true THEN true
      WHEN hsi.id IS NOT NULL AND hsi.status IN ('TRIAL', 'ACTIVE')
           AND (hs.trial_ends_at IS NULL OR hs.trial_ends_at > now() OR hs.status = 'ACTIVE')
           AND (v_user_role = 'HOSPITAL_MANAGER' OR dpl.status = 'ACTIVE')
      THEN true
      ELSE false
    END as has_access,
    -- Has license
    COALESCE(dpl.status = 'ACTIVE', false) as has_license,
    -- Subscription status
    hsi.status as subscription_status,
    -- Unit price
    hsi.unit_price
  FROM products p
  LEFT JOIN hospital_subscriptions hs ON hs.hospital_id = p_hospital_id
  LEFT JOIN hospital_subscription_items hsi ON hsi.subscription_id = hs.id AND hsi.product_id = p.id
  LEFT JOIN doctor_product_licenses dpl ON dpl.hospital_id = p_hospital_id
    AND dpl.doctor_user_id = p_user_id
    AND dpl.product_id = p.id
  WHERE p.is_active = true
  ORDER BY p.name;
END;
$$;

-- Get current pricing for a product in a region
CREATE OR REPLACE FUNCTION get_current_pricing(p_product_id UUID, p_region hospital_region)
RETURNS TABLE(
  pricing_id UUID,
  currency TEXT,
  price_per_doctor_monthly NUMERIC(12,2)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    pp.id,
    pp.currency,
    pp.price_per_doctor_monthly
  FROM product_pricing pp
  WHERE pp.product_id = p_product_id
    AND pp.region = p_region
    AND pp.is_active = true
    AND pp.effective_at <= now()
  ORDER BY pp.effective_at DESC
  LIMIT 1;
$$;

-- Count active licenses for a product in a hospital
CREATE OR REPLACE FUNCTION count_active_licenses(p_hospital_id UUID, p_product_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INTEGER
  FROM doctor_product_licenses
  WHERE hospital_id = p_hospital_id
    AND product_id = p_product_id
    AND status = 'ACTIVE';
$$;

-- Validate discount code for a hospital
CREATE OR REPLACE FUNCTION validate_discount_code(
  p_code TEXT,
  p_hospital_id UUID,
  p_product_ids UUID[]
)
RETURNS TABLE(
  is_valid BOOLEAN,
  discount_code_id UUID,
  discount_type discount_type,
  discount_value NUMERIC(12,2),
  error_message TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_discount discount_codes%ROWTYPE;
  v_hospital_region hospital_region;
  v_already_redeemed BOOLEAN;
BEGIN
  -- Get discount code
  SELECT * INTO v_discount
  FROM discount_codes
  WHERE discount_codes.code = p_code;

  IF v_discount.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::discount_type, NULL::NUMERIC, 'Discount code not found';
    RETURN;
  END IF;

  IF NOT v_discount.is_active THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::discount_type, NULL::NUMERIC, 'Discount code is not active';
    RETURN;
  END IF;

  IF v_discount.expires_at IS NOT NULL AND v_discount.expires_at < now() THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::discount_type, NULL::NUMERIC, 'Discount code has expired';
    RETURN;
  END IF;

  IF v_discount.max_uses IS NOT NULL AND v_discount.used_count >= v_discount.max_uses THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::discount_type, NULL::NUMERIC, 'Discount code has reached maximum uses';
    RETURN;
  END IF;

  -- Check region restriction
  IF v_discount.region IS NOT NULL THEN
    SELECT region INTO v_hospital_region FROM hospitals WHERE id = p_hospital_id;
    IF v_hospital_region != v_discount.region THEN
      RETURN QUERY SELECT false, NULL::UUID, NULL::discount_type, NULL::NUMERIC, 'Discount code not valid for your region';
      RETURN;
    END IF;
  END IF;

  -- Check if already redeemed by this hospital
  SELECT EXISTS (
    SELECT 1 FROM discount_redemptions
    WHERE discount_code_id = v_discount.id AND hospital_id = p_hospital_id
  ) INTO v_already_redeemed;

  IF v_already_redeemed THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::discount_type, NULL::NUMERIC, 'Discount code already used by this hospital';
    RETURN;
  END IF;

  -- Check applicable products
  IF v_discount.applicable_product_ids IS NOT NULL AND array_length(v_discount.applicable_product_ids, 1) > 0 THEN
    IF NOT (p_product_ids && v_discount.applicable_product_ids) THEN
      RETURN QUERY SELECT false, NULL::UUID, NULL::discount_type, NULL::NUMERIC, 'Discount code not valid for selected products';
      RETURN;
    END IF;
  END IF;

  -- All checks passed
  RETURN QUERY SELECT true, v_discount.id, v_discount.type, v_discount.value, NULL::TEXT;
END;
$$;

-- ============================================================
-- 6. RLS POLICIES
-- ============================================================

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospital_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospital_subscription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_product_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_redemptions ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------
-- products policies
-- ----------------------------------------

-- Everyone can read active products
CREATE POLICY "Anyone can view active products"
  ON products
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Super admins can manage all products
CREATE POLICY "Super admins can manage products"
  ON products
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- ----------------------------------------
-- product_pricing policies
-- ----------------------------------------

-- Everyone can read active pricing
CREATE POLICY "Anyone can view active pricing"
  ON product_pricing
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Super admins can manage pricing
CREATE POLICY "Super admins can manage pricing"
  ON product_pricing
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- ----------------------------------------
-- discount_codes policies
-- ----------------------------------------

-- Super admins can manage all discount codes
CREATE POLICY "Super admins can manage discount codes"
  ON discount_codes
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Anyone can view active discount codes (for validation)
CREATE POLICY "Anyone can view active discount codes"
  ON discount_codes
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- ----------------------------------------
-- hospital_subscriptions policies
-- ----------------------------------------

-- Super admins can manage all subscriptions
CREATE POLICY "Super admins can manage subscriptions"
  ON hospital_subscriptions
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Hospital managers can view their subscription
CREATE POLICY "Managers can view hospital subscription"
  ON hospital_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hospital_memberships
      WHERE hospital_id = hospital_subscriptions.hospital_id
        AND user_id = auth.uid()
        AND role IN ('HOSPITAL_MANAGER', 'DOCTOR')
        AND status = 'ACTIVE'
    )
  );

-- Hospital managers can insert subscription (start trial)
CREATE POLICY "Managers can create subscription"
  ON hospital_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospital_memberships
      WHERE hospital_id = hospital_subscriptions.hospital_id
        AND user_id = auth.uid()
        AND role = 'HOSPITAL_MANAGER'
        AND status = 'ACTIVE'
    )
  );

-- Hospital managers can update their subscription (limited fields)
CREATE POLICY "Managers can update subscription"
  ON hospital_subscriptions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hospital_memberships
      WHERE hospital_id = hospital_subscriptions.hospital_id
        AND user_id = auth.uid()
        AND role = 'HOSPITAL_MANAGER'
        AND status = 'ACTIVE'
    )
  );

-- ----------------------------------------
-- hospital_subscription_items policies
-- ----------------------------------------

-- Super admins can manage all items
CREATE POLICY "Super admins can manage subscription items"
  ON hospital_subscription_items
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Hospital members can view items
CREATE POLICY "Members can view subscription items"
  ON hospital_subscription_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM hospital_subscriptions hs
      JOIN hospital_memberships hm ON hm.hospital_id = hs.hospital_id
      WHERE hs.id = hospital_subscription_items.subscription_id
        AND hm.user_id = auth.uid()
        AND hm.status = 'ACTIVE'
    )
  );

-- Hospital managers can insert items
CREATE POLICY "Managers can create subscription items"
  ON hospital_subscription_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM hospital_subscriptions hs
      JOIN hospital_memberships hm ON hm.hospital_id = hs.hospital_id
      WHERE hs.id = hospital_subscription_items.subscription_id
        AND hm.user_id = auth.uid()
        AND hm.role = 'HOSPITAL_MANAGER'
        AND hm.status = 'ACTIVE'
    )
  );

-- ----------------------------------------
-- doctor_product_licenses policies
-- ----------------------------------------

-- Super admins can manage all licenses
CREATE POLICY "Super admins can manage licenses"
  ON doctor_product_licenses
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Hospital managers can manage licenses for their hospital
CREATE POLICY "Managers can manage hospital licenses"
  ON doctor_product_licenses
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hospital_memberships
      WHERE hospital_id = doctor_product_licenses.hospital_id
        AND user_id = auth.uid()
        AND role = 'HOSPITAL_MANAGER'
        AND status = 'ACTIVE'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospital_memberships
      WHERE hospital_id = doctor_product_licenses.hospital_id
        AND user_id = auth.uid()
        AND role = 'HOSPITAL_MANAGER'
        AND status = 'ACTIVE'
    )
  );

-- Doctors can view their own licenses
CREATE POLICY "Doctors can view own licenses"
  ON doctor_product_licenses
  FOR SELECT
  TO authenticated
  USING (doctor_user_id = auth.uid());

-- ----------------------------------------
-- discount_redemptions policies
-- ----------------------------------------

-- Super admins can manage all redemptions
CREATE POLICY "Super admins can manage redemptions"
  ON discount_redemptions
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Hospital managers can view and create redemptions for their hospital
CREATE POLICY "Managers can manage hospital redemptions"
  ON discount_redemptions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hospital_memberships
      WHERE hospital_id = discount_redemptions.hospital_id
        AND user_id = auth.uid()
        AND role = 'HOSPITAL_MANAGER'
        AND status = 'ACTIVE'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospital_memberships
      WHERE hospital_id = discount_redemptions.hospital_id
        AND user_id = auth.uid()
        AND role = 'HOSPITAL_MANAGER'
        AND status = 'ACTIVE'
    )
  );

-- ============================================================
-- 7. SEED DATA
-- ============================================================

-- Insert products
INSERT INTO products (code, name, description, is_active, metadata) VALUES
  ('APPOINTMENTS', 'Appointments', 'Patient appointment scheduling and management system', true, '{"features": ["scheduling", "reminders", "calendar-sync"]}'),
  ('CLINIQ_BRIEF', 'ClinIQBrief', 'AI-powered clinical documentation and briefing assistant', true, '{"features": ["ai-summaries", "voice-to-text", "clinical-notes"]}');

-- Insert pricing for US (USD)
INSERT INTO product_pricing (product_id, region, currency, price_per_doctor_monthly, is_active) VALUES
  ((SELECT id FROM products WHERE code = 'APPOINTMENTS'), 'US', 'USD', 30.00, true),
  ((SELECT id FROM products WHERE code = 'CLINIQ_BRIEF'), 'US', 'USD', 20.00, true);

-- Insert pricing for UK (GBP)
INSERT INTO product_pricing (product_id, region, currency, price_per_doctor_monthly, is_active) VALUES
  ((SELECT id FROM products WHERE code = 'APPOINTMENTS'), 'UK', 'GBP', 25.00, true),
  ((SELECT id FROM products WHERE code = 'CLINIQ_BRIEF'), 'UK', 'GBP', 15.00, true);

-- Insert pricing for India (INR)
INSERT INTO product_pricing (product_id, region, currency, price_per_doctor_monthly, is_active) VALUES
  ((SELECT id FROM products WHERE code = 'APPOINTMENTS'), 'IN', 'INR', 999.00, true),
  ((SELECT id FROM products WHERE code = 'CLINIQ_BRIEF'), 'IN', 'INR', 699.00, true);

-- Insert sample discount codes
INSERT INTO discount_codes (code, type, value, is_active, max_uses, expires_at, conditions) VALUES
  ('LAUNCH30', 'PERCENT', 30.00, true, 100, now() + interval '90 days', '{"minDoctors": 1}'),
  ('FREETRIAL', 'FREE_MONTHS', 1.00, true, NULL, NULL, NULL),
  ('INDIA500', 'FIXED', 500.00, true, 50, now() + interval '60 days', '{"minDoctors": 3}');

-- Set region restriction for India discount
UPDATE discount_codes SET region = 'IN' WHERE code = 'INDIA500';

-- ============================================================
-- 8. GRANTS
-- ============================================================

GRANT USAGE ON TYPE product_code TO authenticated;
GRANT USAGE ON TYPE subscription_status TO authenticated;
GRANT USAGE ON TYPE license_status TO authenticated;
GRANT USAGE ON TYPE discount_type TO authenticated;

GRANT SELECT ON products TO authenticated;
GRANT SELECT ON product_pricing TO authenticated;
GRANT SELECT ON discount_codes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hospital_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hospital_subscription_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON doctor_product_licenses TO authenticated;
GRANT SELECT, INSERT ON discount_redemptions TO authenticated;

-- Service role gets full access
GRANT ALL ON products TO service_role;
GRANT ALL ON product_pricing TO service_role;
GRANT ALL ON discount_codes TO service_role;
GRANT ALL ON hospital_subscriptions TO service_role;
GRANT ALL ON hospital_subscription_items TO service_role;
GRANT ALL ON doctor_product_licenses TO service_role;
GRANT ALL ON discount_redemptions TO service_role;
