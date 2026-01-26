# Step 3: Agreement & Consent Gating

This document describes the legal agreement and consent gating system implemented in ClinQFlow.

## Overview

ClinQFlow requires users to accept region-specific legal agreements before accessing hospital data. This ensures compliance with:

- **US**: HIPAA (via Business Associate Agreement)
- **UK**: UK GDPR (via Data Processing Agreement)
- **India**: DPDP Act 2023 (via Data Processing Agreement)

## Key Concepts

### Document Types

| Type | Description | Required For |
|------|-------------|--------------|
| `MSA` | Master Service Agreement | Hospital Managers |
| `DPA` | Data Processing Agreement (GDPR/DPDP) | Hospital Managers (UK/IN) |
| `BAA` | Business Associate Agreement (HIPAA) | Hospital Managers (US) |
| `DOCTOR_CONSENT` | Physician Terms & Consent | Doctors |

### Region-Based Requirements

Documents are automatically assigned to hospitals based on their registered region:

| Region | Manager Documents | Doctor Documents |
|--------|-------------------|------------------|
| US | MSA + BAA | Doctor Consent |
| UK | MSA + DPA (UK) | Doctor Consent |
| IN | MSA + DPA (IN) | Doctor Consent |

### Versioning

- Each document has a version (e.g., "v1", "2026-01")
- Only `is_active = true` documents with `effective_at <= now()` are enforced
- When a new version becomes active, users must re-accept

## Architecture

### Database Tables

```
legal_documents              - Document definitions (type, region, version, content)
hospital_required_documents  - Links documents to hospitals by role
document_acceptances         - Audit log of user acceptances
```

### Flow

1. **Hospital Creation**: Trigger automatically attaches required documents based on region
2. **User Login**: AgreementGateGuard checks for pending documents
3. **Access Blocked**: 403 `AGREEMENT_REQUIRED` returned if documents pending
4. **Accept Flow**: User views and accepts documents via `/legal/accept`
5. **Access Granted**: User can now access hospital resources

## API Endpoints

### User Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/legal/requirements` | Get user's pending/accepted documents for current hospital |
| GET | `/v1/legal/documents/:id` | Get document content |
| POST | `/v1/legal/accept` | Accept a document |

### Admin Endpoints (Super Admin Only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/legal/admin/documents` | List all documents |
| POST | `/v1/legal/admin/documents` | Create new document |
| PATCH | `/v1/legal/admin/documents/:id` | Update document |
| GET | `/v1/legal/admin/stats` | Acceptance statistics by hospital |
| POST | `/v1/legal/admin/ensure-hospital-docs` | Ensure docs for specific hospital |
| POST | `/v1/legal/admin/ensure-all-hospitals-docs` | Ensure docs for all hospitals |

## Frontend Pages

| Path | Description |
|------|-------------|
| `/legal/accept` | View and accept required documents |
| `/admin/legal` | Super Admin: Manage documents and view stats |

## Testing

### Prerequisites

1. Run the migration:
   ```bash
   # Apply migration to Supabase
   supabase db push
   # OR run directly in Supabase SQL editor
   ```

2. Start the servers:
   ```bash
   cd apps/api && npm run start:dev
   cd apps/web && npm run dev
   ```

### Test Scenarios

#### 1. UK Hospital Manager Flow

1. Login as Super Admin
2. Create a UK hospital (region: UK)
3. Invite a manager to the UK hospital
4. Manager accepts invite and logs in
5. **Expected**: Redirected to `/legal/accept`
6. Manager must sign:
   - Master Service Agreement (GLOBAL)
   - Data Processing Agreement (UK)
7. After accepting both, manager can access dashboard

#### 2. US Doctor Flow

1. Login as a Hospital Manager (US hospital)
2. Invite a doctor
3. Doctor accepts invite and logs in
4. **Expected**: Redirected to `/legal/accept`
5. Doctor must sign:
   - Physician Terms & Consent (GLOBAL)
6. After accepting, doctor can access hospital pages

#### 3. Multi-Hospital User

1. Add same doctor to both UK and IN hospitals
2. Doctor can access UK hospital (already accepted)
3. Doctor switches to IN hospital
4. **Expected**: Redirected to `/legal/accept` for IN hospital
5. Doctor must accept IN-specific Doctor Consent
6. After accepting, doctor can access IN hospital

#### 4. New Document Version

1. Super Admin creates new MSA v2 (set `is_active = true`)
2. Manager who accepted v1 logs in
3. **Expected**: Redirected to `/legal/accept`
4. Manager must accept new MSA v2
5. Previous v1 acceptance remains in audit log

### API Testing with cURL

```bash
# Get requirements (with hospital context)
curl -X GET "http://localhost:4000/v1/legal/requirements" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-hospital-id: $HOSPITAL_ID"

# View document
curl -X GET "http://localhost:4000/v1/legal/documents/$DOC_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-hospital-id: $HOSPITAL_ID"

# Accept document
curl -X POST "http://localhost:4000/v1/legal/accept" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-hospital-id: $HOSPITAL_ID" \
  -H "Content-Type: application/json" \
  -d '{"docId": "'$DOC_ID'", "signatureName": "John Doe", "acknowledged": true}'

# Admin: List documents
curl -X GET "http://localhost:4000/v1/legal/admin/documents" \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN"

# Admin: Get stats
curl -X GET "http://localhost:4000/v1/legal/admin/stats" \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN"

# Admin: Ensure all hospitals have required docs
curl -X POST "http://localhost:4000/v1/legal/admin/ensure-all-hospitals-docs" \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN"
```

## Security Considerations

### RLS Policies

- Users can only view documents required for their hospital memberships
- Users can only accept documents for hospitals they belong to
- Acceptances are immutable (no UPDATE/DELETE for regular users)
- Super Admins can manage all documents and view all acceptances

### Audit Trail

Each acceptance records:
- `accepted_at` - Timestamp
- `ip_address` - Client IP
- `user_agent` - Browser/client info
- `signature_name` - Typed name
- `signature_email` - Email at time of signing
- `role_at_acceptance` - User's role when they signed

### Click-Wrap Implementation

Current implementation uses click-wrap (checkbox + typed name). The schema supports future expansion to:
- DocuSign integration (`acceptance_method: 'DOCU_SIGN'`)
- Wet signatures (`acceptance_method: 'WET_SIGNATURE'`)

## Bypassed Routes

The following routes are NOT gated (users can access without accepting documents):

- `/v1/health`, `/v1/ready` - Health checks
- `/v1/me` - Current user info (needed to show acceptance UI)
- `/v1/legal/*` - Legal module (needed to accept documents)
- `/v1/invites/*` - Invite acceptance flow
- `/debug/*` - Debug endpoints

## Troubleshooting

### "Document not found" Error

- Check if document exists in `legal_documents`
- Check if `is_active = true` and `effective_at <= now()`
- Check if document is linked to hospital in `hospital_required_documents`

### User Not Being Gated

- Verify `x-hospital-id` header is being sent
- Check user has a membership in that hospital
- Super Admins are never gated (by design)
- Check if route is in the allowlist

### Documents Not Auto-Attached

- Check hospital's `region` is set correctly (US/UK/IN)
- Run `ensure_hospital_required_docs(hospital_id)` manually
- Check if matching documents exist for that region

### Resetting for Testing

```sql
-- Clear all acceptances (CAUTION: audit data loss)
DELETE FROM document_acceptances;

-- Clear required document assignments
DELETE FROM hospital_required_documents;

-- Re-attach documents to all hospitals
DO $$
DECLARE v_hospital RECORD;
BEGIN
  FOR v_hospital IN SELECT id FROM hospitals LOOP
    PERFORM ensure_hospital_required_docs(v_hospital.id);
  END LOOP;
END;
$$;
```

## Future Enhancements

1. **DocuSign Integration**: Implement `DOCU_SIGN` acceptance method
2. **Document Templates**: Support templated documents with hospital-specific placeholders
3. **Expiring Acceptances**: Add `expires_at` to force periodic re-acceptance
4. **Version Comparison**: Show diff when users need to re-accept a new version
5. **Bulk Notifications**: Notify users when new documents require their acceptance
