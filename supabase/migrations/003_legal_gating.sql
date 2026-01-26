-- ============================================================
-- Migration 003: Legal Document Gating (Step 3)
-- Agreement & Consent gating with region-aware requirements
-- ============================================================

-- ============================================================
-- 1. ENUMS
-- ============================================================

-- Document types for legal agreements
CREATE TYPE legal_doc_type AS ENUM (
  'MSA',              -- Master Service Agreement (for managers)
  'DPA',              -- Data Processing Agreement (UK GDPR, India DPDP)
  'BAA',              -- Business Associate Agreement (US HIPAA)
  'DOCTOR_CONSENT'    -- Doctor consent/terms (for doctors)
);

-- Region scope for documents
CREATE TYPE legal_doc_region AS ENUM (
  'GLOBAL',           -- Applies to all regions
  'US',               -- United States specific
  'UK',               -- United Kingdom specific
  'IN'                -- India specific
);

-- Method of acceptance (extensible for DocuSign later)
CREATE TYPE acceptance_method AS ENUM (
  'CLICK_WRAP',       -- Checkbox + typed name
  'DOCU_SIGN',        -- DocuSign integration (future)
  'WET_SIGNATURE'     -- Physical signature (future)
);

-- ============================================================
-- 2. TABLES
-- ============================================================

-- Legal documents (versioned)
CREATE TABLE legal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type legal_doc_type NOT NULL,
  region legal_doc_region NOT NULL,
  version TEXT NOT NULL,                              -- e.g., "v1", "2026-01"
  title TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(doc_type, region, version)
);

-- Required documents per hospital (auto-populated based on region)
CREATE TABLE hospital_required_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  doc_id UUID NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
  required_for_role app_role NOT NULL,                -- HOSPITAL_MANAGER or DOCTOR
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(hospital_id, doc_id, required_for_role)
);

-- User acceptance records (immutable audit log)
CREATE TABLE document_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_at_acceptance app_role NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acceptance_method acceptance_method NOT NULL DEFAULT 'CLICK_WRAP',
  ip_address TEXT NULL,
  user_agent TEXT NULL,
  signature_name TEXT NULL,                           -- Typed name for click-wrap
  signature_email TEXT NULL,                          -- Email at time of signature
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(doc_id, hospital_id, user_id)                -- One acceptance per doc/hospital/user
);

-- ============================================================
-- 3. INDEXES
-- ============================================================

CREATE INDEX idx_hospital_required_docs_lookup
  ON hospital_required_documents(hospital_id, required_for_role);

CREATE INDEX idx_document_acceptances_lookup
  ON document_acceptances(hospital_id, user_id);

CREATE INDEX idx_legal_documents_active
  ON legal_documents(doc_type, region, is_active, effective_at DESC);

-- ============================================================
-- 4. TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE TRIGGER update_legal_documents_updated_at
  BEFORE UPDATE ON legal_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 5. HELPER FUNCTIONS
-- ============================================================

-- Get user's role in a specific hospital (wrapper for existing function)
CREATE OR REPLACE FUNCTION get_user_role_in_hospital(p_user UUID, p_hospital UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM hospital_memberships
  WHERE user_id = p_user AND hospital_id = p_hospital AND status = 'ACTIVE'
  LIMIT 1;
$$;

-- Check if user has pending required documents
CREATE OR REPLACE FUNCTION has_pending_documents(p_user UUID, p_hospital UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM hospital_required_documents hrd
    JOIN legal_documents ld ON ld.id = hrd.doc_id
    WHERE hrd.hospital_id = p_hospital
      AND hrd.required_for_role = get_user_role_in_hospital(p_user, p_hospital)
      AND ld.is_active = true
      AND ld.effective_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM document_acceptances da
        WHERE da.doc_id = hrd.doc_id
          AND da.hospital_id = p_hospital
          AND da.user_id = p_user
      )
  );
$$;

-- Get the latest active document for a type/region combination
CREATE OR REPLACE FUNCTION get_latest_document(
  p_doc_type legal_doc_type,
  p_region legal_doc_region
)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM legal_documents
  WHERE doc_type = p_doc_type
    AND region = p_region
    AND is_active = true
    AND effective_at <= now()
  ORDER BY effective_at DESC, version DESC
  LIMIT 1;
$$;

-- ============================================================
-- 6. ENSURE HOSPITAL REQUIRED DOCS FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION ensure_hospital_required_docs(p_hospital UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_region TEXT;
  v_doc_id UUID;
BEGIN
  -- Get hospital's region as text (to cast to legal_doc_region)
  SELECT region::TEXT INTO v_region FROM hospitals WHERE id = p_hospital;

  IF v_region IS NULL THEN
    RAISE EXCEPTION 'Hospital not found: %', p_hospital;
  END IF;

  -- =====================================================
  -- HOSPITAL_MANAGER requirements
  -- =====================================================

  -- Always require MSA (prefer region-specific, fallback to GLOBAL)
  v_doc_id := get_latest_document('MSA', v_region::legal_doc_region);
  IF v_doc_id IS NULL THEN
    v_doc_id := get_latest_document('MSA', 'GLOBAL'::legal_doc_region);
  END IF;
  IF v_doc_id IS NOT NULL THEN
    INSERT INTO hospital_required_documents (hospital_id, doc_id, required_for_role)
    VALUES (p_hospital, v_doc_id, 'HOSPITAL_MANAGER')
    ON CONFLICT (hospital_id, doc_id, required_for_role) DO NOTHING;
  END IF;

  -- UK: Require DPA (GDPR compliance)
  IF v_region = 'UK' THEN
    v_doc_id := get_latest_document('DPA', 'UK'::legal_doc_region);
    IF v_doc_id IS NOT NULL THEN
      INSERT INTO hospital_required_documents (hospital_id, doc_id, required_for_role)
      VALUES (p_hospital, v_doc_id, 'HOSPITAL_MANAGER')
      ON CONFLICT (hospital_id, doc_id, required_for_role) DO NOTHING;
    END IF;
  END IF;

  -- IN: Require DPA (India DPDP Act compliance)
  IF v_region = 'IN' THEN
    v_doc_id := get_latest_document('DPA', 'IN'::legal_doc_region);
    IF v_doc_id IS NOT NULL THEN
      INSERT INTO hospital_required_documents (hospital_id, doc_id, required_for_role)
      VALUES (p_hospital, v_doc_id, 'HOSPITAL_MANAGER')
      ON CONFLICT (hospital_id, doc_id, required_for_role) DO NOTHING;
    END IF;
  END IF;

  -- US: Require BAA (HIPAA compliance)
  IF v_region = 'US' THEN
    v_doc_id := get_latest_document('BAA', 'US'::legal_doc_region);
    IF v_doc_id IS NOT NULL THEN
      INSERT INTO hospital_required_documents (hospital_id, doc_id, required_for_role)
      VALUES (p_hospital, v_doc_id, 'HOSPITAL_MANAGER')
      ON CONFLICT (hospital_id, doc_id, required_for_role) DO NOTHING;
    END IF;
  END IF;

  -- =====================================================
  -- DOCTOR requirements
  -- =====================================================

  -- Always require DOCTOR_CONSENT (prefer region-specific, fallback to GLOBAL)
  v_doc_id := get_latest_document('DOCTOR_CONSENT', v_region::legal_doc_region);
  IF v_doc_id IS NULL THEN
    v_doc_id := get_latest_document('DOCTOR_CONSENT', 'GLOBAL'::legal_doc_region);
  END IF;
  IF v_doc_id IS NOT NULL THEN
    INSERT INTO hospital_required_documents (hospital_id, doc_id, required_for_role)
    VALUES (p_hospital, v_doc_id, 'DOCTOR')
    ON CONFLICT (hospital_id, doc_id, required_for_role) DO NOTHING;
  END IF;

END;
$$;

-- ============================================================
-- 7. TRIGGER: Auto-attach required docs on hospital create/update
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_ensure_hospital_docs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only run if this is a new hospital or region changed
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.region IS DISTINCT FROM NEW.region) THEN
    PERFORM ensure_hospital_required_docs(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ensure_hospital_docs_trigger
  AFTER INSERT OR UPDATE OF region ON hospitals
  FOR EACH ROW EXECUTE FUNCTION trigger_ensure_hospital_docs();

-- ============================================================
-- 8. RLS POLICIES
-- ============================================================

ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospital_required_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_acceptances ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------
-- legal_documents policies
-- ----------------------------------------

-- Super admins can do everything
CREATE POLICY "Super admins can manage legal documents"
  ON legal_documents
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Users can view documents required for their hospitals
CREATE POLICY "Users can view required documents"
  ON legal_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hospital_required_documents hrd
      JOIN hospital_memberships hm ON hm.hospital_id = hrd.hospital_id
      WHERE hrd.doc_id = legal_documents.id
        AND hm.user_id = auth.uid()
        AND hm.status = 'ACTIVE'
    )
  );

-- ----------------------------------------
-- hospital_required_documents policies
-- ----------------------------------------

-- Super admins can manage all
CREATE POLICY "Super admins can manage required docs"
  ON hospital_required_documents
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Hospital managers can view their hospital's required docs
CREATE POLICY "Managers can view hospital required docs"
  ON hospital_required_documents
  FOR SELECT
  TO authenticated
  USING (
    user_has_membership(auth.uid(), hospital_id)
  );

-- ----------------------------------------
-- document_acceptances policies
-- ----------------------------------------

-- Super admins can view all and delete (for rare cleanup)
CREATE POLICY "Super admins can manage acceptances"
  ON document_acceptances
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Users can view their own acceptances
CREATE POLICY "Users can view own acceptances"
  ON document_acceptances
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Hospital managers can view acceptances for their hospital
CREATE POLICY "Managers can view hospital acceptances"
  ON document_acceptances
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hospital_memberships
      WHERE hospital_id = document_acceptances.hospital_id
        AND user_id = auth.uid()
        AND role = 'HOSPITAL_MANAGER'
        AND status = 'ACTIVE'
    )
  );

-- Users can insert their own acceptance for hospitals they belong to
CREATE POLICY "Users can accept documents for their hospitals"
  ON document_acceptances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND user_has_membership(auth.uid(), hospital_id)
    AND EXISTS (
      SELECT 1 FROM hospital_required_documents hrd
      WHERE hrd.doc_id = document_acceptances.doc_id
        AND hrd.hospital_id = document_acceptances.hospital_id
        AND hrd.required_for_role = get_user_role_in_hospital(auth.uid(), hospital_id)
    )
  );

-- ============================================================
-- 9. SEED PLACEHOLDER DOCUMENTS
-- ============================================================

-- MSA - Global (Master Service Agreement)
INSERT INTO legal_documents (doc_type, region, version, title, content_markdown, is_active, effective_at)
VALUES (
  'MSA',
  'GLOBAL',
  'v1',
  'Master Service Agreement',
  E'# Master Service Agreement\n\n## Terms and Conditions\n\nThis Master Service Agreement ("Agreement") governs the use of ClinQflow services.\n\n### 1. Service Description\n\nClinQflow provides a healthcare management platform that enables hospitals to manage patient data, appointments, and medical records.\n\n### 2. Obligations\n\n- You agree to use the service in compliance with all applicable laws\n- You agree to maintain the confidentiality of patient data\n- You agree to notify us of any security incidents within 24 hours\n\n### 3. Data Protection\n\nWe implement industry-standard security measures to protect your data. See our Data Processing Agreement for region-specific requirements.\n\n### 4. Limitation of Liability\n\nOur liability is limited to the fees paid in the 12 months preceding any claim.\n\n### 5. Termination\n\nEither party may terminate with 30 days written notice.\n\n---\n\n**Effective Date:** January 2026\n\n**Version:** v1',
  true,
  now()
);

-- DPA - UK (GDPR)
INSERT INTO legal_documents (doc_type, region, version, title, content_markdown, is_active, effective_at)
VALUES (
  'DPA',
  'UK',
  'v1',
  'Data Processing Agreement (UK GDPR)',
  E'# Data Processing Agreement\n## UK General Data Protection Regulation Compliance\n\nThis Data Processing Agreement ("DPA") supplements the Master Service Agreement and establishes the terms under which ClinQflow processes personal data on behalf of the Hospital.\n\n### 1. Definitions\n\n- **Personal Data**: Any information relating to an identified or identifiable natural person\n- **Data Controller**: The Hospital\n- **Data Processor**: ClinQflow\n\n### 2. Processing Scope\n\nWe process personal data only as necessary to provide the agreed services and in accordance with your documented instructions.\n\n### 3. Data Subject Rights\n\nWe will assist you in responding to requests from data subjects exercising their rights under UK GDPR.\n\n### 4. Sub-processors\n\nWe maintain a list of approved sub-processors. You will be notified of any changes.\n\n### 5. Security Measures\n\n- Encryption at rest and in transit\n- Access controls and audit logging\n- Regular security assessments\n- Incident response procedures\n\n### 6. Data Breach Notification\n\nWe will notify you of any personal data breach within 72 hours.\n\n### 7. International Transfers\n\nData transfers outside the UK comply with appropriate safeguards including Standard Contractual Clauses.\n\n---\n\n**Effective Date:** January 2026\n\n**Version:** v1',
  true,
  now()
);

-- DPA - India (DPDP Act)
INSERT INTO legal_documents (doc_type, region, version, title, content_markdown, is_active, effective_at)
VALUES (
  'DPA',
  'IN',
  'v1',
  'Data Processing Agreement (India DPDP Act)',
  E'# Data Processing Agreement\n## Digital Personal Data Protection Act 2023 Compliance\n\nThis Data Processing Agreement ("DPA") supplements the Master Service Agreement and establishes compliance with the Digital Personal Data Protection Act, 2023.\n\n### 1. Definitions\n\nAs per the DPDP Act:\n- **Data Fiduciary**: The Hospital (determines purpose and means of processing)\n- **Data Processor**: ClinQflow (processes data on behalf of Data Fiduciary)\n- **Data Principal**: The individual whose personal data is processed\n\n### 2. Lawful Processing\n\nPersonal data is processed based on:\n- Consent of the Data Principal, or\n- Legitimate uses as specified under Section 7 of the DPDP Act\n\n### 3. Notice Requirements\n\nWe will assist you in providing notice to Data Principals as required under Section 5.\n\n### 4. Data Principal Rights\n\nWe support the following rights:\n- Right to access information\n- Right to correction and erasure\n- Right to grievance redressal\n- Right to nominate\n\n### 5. Security Safeguards\n\nWe implement reasonable security safeguards to protect personal data including:\n- Technical measures (encryption, access controls)\n- Organizational measures (policies, training)\n- Breach detection and response\n\n### 6. Data Localization\n\nData storage and processing comply with applicable data localization requirements.\n\n### 7. Breach Notification\n\nAny personal data breach will be notified within timelines prescribed by the Data Protection Board.\n\n---\n\n**Effective Date:** January 2026\n\n**Version:** v1',
  true,
  now()
);

-- BAA - US (HIPAA)
INSERT INTO legal_documents (doc_type, region, version, title, content_markdown, is_active, effective_at)
VALUES (
  'BAA',
  'US',
  'v1',
  'Business Associate Agreement (HIPAA)',
  E'# Business Associate Agreement\n## HIPAA Compliance\n\nThis Business Associate Agreement ("BAA") supplements the Master Service Agreement and ensures compliance with the Health Insurance Portability and Accountability Act of 1996 ("HIPAA").\n\n### 1. Definitions\n\n- **Covered Entity**: The Hospital\n- **Business Associate**: ClinQflow\n- **Protected Health Information (PHI)**: Individually identifiable health information\n\n### 2. Permitted Uses and Disclosures\n\nClinQflow may use or disclose PHI only:\n- As necessary to perform services under the MSA\n- As required by law\n- As otherwise permitted under this BAA\n\n### 3. Safeguards\n\nWe will:\n- Implement administrative, physical, and technical safeguards\n- Ensure workforce compliance with HIPAA requirements\n- Report security incidents within 24 hours\n\n### 4. Individual Rights\n\nWe will make PHI available to support:\n- Right of access\n- Right to amendment\n- Right to accounting of disclosures\n\n### 5. Subcontractors\n\nAll subcontractors with access to PHI will enter into written agreements with equivalent protections.\n\n### 6. Breach Notification\n\nWe will report any breach of unsecured PHI within 60 days as required by the HITECH Act.\n\n### 7. Termination\n\nUpon termination, we will return or destroy all PHI unless retention is required by law.\n\n---\n\n**Effective Date:** January 2026\n\n**Version:** v1',
  true,
  now()
);

-- DOCTOR_CONSENT - Global
INSERT INTO legal_documents (doc_type, region, version, title, content_markdown, is_active, effective_at)
VALUES (
  'DOCTOR_CONSENT',
  'GLOBAL',
  'v1',
  'Physician Terms & Consent',
  E'# Physician Terms & Consent\n\nBy accepting these terms, you agree to the following as a physician using the ClinQflow platform.\n\n### 1. Professional Conduct\n\n- You will maintain appropriate professional standards\n- You will keep patient information confidential\n- You will comply with all applicable medical regulations\n\n### 2. Platform Usage\n\n- You will use accurate and up-to-date credentials\n- You will not share your account access with others\n- You will log out after each session on shared devices\n\n### 3. Data Entry\n\n- You are responsible for the accuracy of medical records you create\n- You will document patient encounters in a timely manner\n- You will follow the hospital''s documentation standards\n\n### 4. Communication\n\n- You will respond to urgent patient communications promptly\n- You will use the platform''s secure messaging for PHI\n- You will not use personal email or messaging for patient data\n\n### 5. Compliance\n\n- You will complete required compliance training\n- You will report any suspected security incidents\n- You will cooperate with audits and investigations\n\n### 6. Acknowledgment\n\nBy signing below, you acknowledge that you have read, understood, and agree to these terms.\n\n---\n\n**Effective Date:** January 2026\n\n**Version:** v1',
  true,
  now()
);

-- ============================================================
-- 10. BACKFILL: Ensure required docs for existing hospitals
-- ============================================================

DO $$
DECLARE
  v_hospital RECORD;
BEGIN
  FOR v_hospital IN SELECT id FROM hospitals LOOP
    PERFORM ensure_hospital_required_docs(v_hospital.id);
  END LOOP;
END;
$$;

-- ============================================================
-- 11. GRANT PERMISSIONS (for service role usage)
-- ============================================================

GRANT USAGE ON TYPE legal_doc_type TO authenticated;
GRANT USAGE ON TYPE legal_doc_region TO authenticated;
GRANT USAGE ON TYPE acceptance_method TO authenticated;

GRANT SELECT ON legal_documents TO authenticated;
GRANT SELECT ON hospital_required_documents TO authenticated;
GRANT SELECT, INSERT ON document_acceptances TO authenticated;

-- Service role (API) needs broader access
GRANT ALL ON legal_documents TO service_role;
GRANT ALL ON hospital_required_documents TO service_role;
GRANT ALL ON document_acceptances TO service_role;
