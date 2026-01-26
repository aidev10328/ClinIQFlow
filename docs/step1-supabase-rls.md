# Step 1: Multi-Tenant Foundation with Supabase RLS

This document describes how to set up and test the multi-tenant authentication and authorization system using Supabase Auth and Row Level Security (RLS).

## Overview

The system uses:
- **Supabase Auth** for user authentication (Super Admin, Hospital Manager, Doctor)
- **Supabase RLS** for row-level authorization
- **Hospital memberships** to control access to hospital data
- **Patients do not log in** - they are managed by staff
- **Staff accounts** are placeholders for future hospital-scoped username/password auth

## Prerequisites

1. A Supabase project (you already have: `funhagjrsaikcbirncjf`)
2. Node.js and npm installed
3. The CliniQFlow project cloned locally

## Setup Instructions

### 1. Run the SQL Migration

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/funhagjrsaikcbirncjf
2. Navigate to **SQL Editor**
3. Copy the contents of `supabase/migrations/001_multi_tenant_foundation.sql`
4. Paste and run the SQL

This creates:
- Enums: `app_role`, `hospital_region`
- Tables: `hospitals`, `profiles`, `hospital_memberships`, `staff_accounts`
- Helper functions for RLS
- RLS policies for all tables
- A demo hospital "Demo Hospital US"

### 2. Get Your Supabase Keys

From your Supabase Dashboard → Settings → API:

1. **Project URL**: `https://funhagjrsaikcbirncjf.supabase.co`
2. **anon public key**: Copy this (starts with `eyJ...`)
3. **JWT Secret**: Settings → API → JWT Settings → JWT Secret

### 3. Configure Environment Variables

**API (`apps/api/.env`):**
```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.funhagjrsaikcbirncjf.supabase.co:5432/postgres"
JWT_SECRET="your-old-jwt-secret"
API_PORT=4000
CORS_ORIGIN="http://localhost:3000"

# Supabase Configuration
SUPABASE_URL="https://funhagjrsaikcbirncjf.supabase.co"
SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_JWT_SECRET="your-supabase-jwt-secret"
```

**Web (`apps/web/.env.local`):**
```env
NEXT_PUBLIC_SUPABASE_URL=https://funhagjrsaikcbirncjf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

### 4. Create Your First User

1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add user" → "Create new user"
3. Enter email and password
4. The user will be created and a profile will be auto-generated via trigger

### 5. Make User a Super Admin

After creating the user, run this SQL to make them a super admin:

```sql
UPDATE profiles
SET is_super_admin = true
WHERE email = 'your-email@example.com';
```

### 6. Add User to a Hospital

To add your user to the Demo Hospital as a Hospital Manager:

```sql
INSERT INTO hospital_memberships (hospital_id, user_id, role, is_primary)
SELECT
    (SELECT id FROM hospitals WHERE name = 'Demo Hospital US'),
    (SELECT user_id FROM profiles WHERE email = 'your-email@example.com'),
    'HOSPITAL_MANAGER',
    true;
```

Or as a Doctor:

```sql
INSERT INTO hospital_memberships (hospital_id, user_id, role, is_primary)
SELECT
    (SELECT id FROM hospitals WHERE name = 'Demo Hospital US'),
    (SELECT user_id FROM profiles WHERE email = 'doctor@example.com'),
    'DOCTOR',
    true;
```

### 7. Start the Application

```bash
# Install dependencies
npm install
cd apps/api && npm install
cd ../web && npm install
cd ../..

# Start both servers
npm run dev
```

- Web: http://localhost:3000
- API: http://localhost:4000

## Testing the System

### Login Flow

1. Go to http://localhost:3000/login
2. Enter your Supabase user credentials
3. If you belong to multiple hospitals, you'll see the hospital selector
4. If you belong to one hospital, it auto-selects
5. After selection, you'll see the dashboard with hospital context

### Switching Hospitals

If you belong to multiple hospitals:
1. Click on the hospital name in the navigation bar
2. Select a different hospital
3. The dashboard updates with new hospital context

### Testing RLS

#### As a Regular User (Doctor)
Create a second user and add them to a different hospital. When logged in:
- They should only see hospitals they have membership in
- Attempting to access other hospital data will return empty results

#### As a Super Admin
- Can see all hospitals
- Can see all profiles
- Has full access to all data

### API Testing

```bash
# Get your access token from browser dev tools (Network tab → any API call → Authorization header)

# Test /v1/me endpoint
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -H "x-hospital-id: HOSPITAL_UUID" \
     http://localhost:4000/v1/me

# Response includes:
# - user profile
# - list of hospitals with roles
# - current hospital ID
```

## Architecture

### Authentication Flow

```
1. User enters email/password on login page
2. Web app calls Supabase Auth signInWithPassword
3. Supabase returns access_token (JWT)
4. Web app stores session and calls /v1/me
5. API verifies JWT using SUPABASE_JWT_SECRET
6. API queries Supabase with user's token (RLS applies)
7. User sees only authorized data
```

### RLS Policy Summary

| Table | Super Admin | Hospital Manager | Doctor |
|-------|-------------|------------------|--------|
| profiles | Read/Write all | Read own | Read own |
| hospitals | Full access | Read (their hospitals) | Read (their hospitals) |
| hospital_memberships | Full access | Read/Write doctors in their hospital | Read own |
| staff_accounts | Full access | Full access in their hospital | No access |

### Header: x-hospital-id

When making API requests, include the current hospital context:

```javascript
headers: {
  'Authorization': 'Bearer <access_token>',
  'x-hospital-id': '<current_hospital_uuid>'
}
```

This is automatically added by the `apiFetch` helper from localStorage.

## Key Files

### API
- `apps/api/src/supabase/supabase.service.ts` - Supabase client and JWT verification
- `apps/api/src/supabase/supabase.guard.ts` - Route protection guard
- `apps/api/src/me/me.controller.ts` - User profile endpoint

### Web
- `apps/web/lib/supabase.ts` - Supabase client singleton
- `apps/web/lib/api.ts` - API fetch helper with auth
- `apps/web/components/AuthProvider.tsx` - Auth context with Supabase
- `apps/web/app/login/page.tsx` - Login page
- `apps/web/app/select-hospital/page.tsx` - Hospital selector

### Database
- `supabase/migrations/001_multi_tenant_foundation.sql` - Full migration

## Troubleshooting

### "Invalid or expired token"
- Check that `SUPABASE_JWT_SECRET` in API .env matches your Supabase JWT secret
- Ensure the token hasn't expired (default 1 hour)

### User can see all hospitals
- Verify RLS is enabled: `ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;`
- Check the user isn't marked as super admin
- Verify policies exist: Check Supabase Dashboard → Database → Policies

### Profile not created on signup
- Check the trigger exists: `SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';`
- Manually run the profile creation if needed

### No hospitals shown after login
- User needs a hospital_membership record
- Run the INSERT query in Step 6 above

## Next Steps

After Step 1 is complete, you can:
1. Add more business tables (patients, appointments, etc.)
2. Add RLS policies to new tables using the same patterns
3. Build out the staff authentication system
4. Create hospital-specific features

All new tables should:
- Have a `hospital_id` column for multi-tenancy
- Enable RLS with appropriate policies
- Use the helper functions (`current_user_id()`, `is_super_admin()`, etc.)
