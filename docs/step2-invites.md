# Step 2: Invitations and Onboarding

This document describes the invitation system and onboarding flows implemented in CliniQFlow.

## Overview

The system supports three types of users:
1. **Super Admins** - Manage all hospitals, invite hospital managers
2. **Hospital Managers/Doctors** - Manage their hospital, invite other doctors
3. **Staff Accounts** - Clinic staff with username/password auth (separate from Supabase)

## Database Schema

### hospital_invites table
```sql
CREATE TABLE hospital_invites (
  id UUID PRIMARY KEY,
  hospital_id UUID REFERENCES hospitals(id),
  invited_email TEXT NOT NULL,
  role app_role NOT NULL,
  token_hash TEXT NOT NULL,           -- SHA256 hash of token
  status invite_status DEFAULT 'pending',
  message TEXT,
  invited_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### staff_accounts table
```sql
CREATE TABLE staff_accounts (
  id UUID PRIMARY KEY,
  hospital_id UUID REFERENCES hospitals(id),
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,        -- bcrypt hashed
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## User Flows

### Super Admin Flow

1. **Login** → `/login` (Supabase Auth)
2. **Hospital Management** → `/admin/hospitals`
   - Create new hospitals
   - Invite hospital managers via email

### Hospital Manager Flow

1. **Login** → `/login` (Supabase Auth)
2. **Select Hospital** → `/select-hospital`
3. **Team Management** → `/hospital/users`
   - View doctors and managers
   - Invite new doctors
   - Create staff accounts
   - Manage staff status

### Invite Acceptance Flow

1. User receives invite email with link: `/invite/accept?token=xxx`
2. User lands on invite page, sees invite details
3. If not logged in:
   - Can login to existing account
   - Can create new account
4. Once authenticated, click "Accept Invite"
5. System creates hospital membership and redirects to dashboard

### Staff Login Flow

1. Staff navigate to `/staff/login`
2. Login with username/password
3. Session stored in httpOnly cookie (`staff_token`)
4. Access staff portal with role-based features

## API Endpoints

### Invites Module

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/v1/invites/create-manager` | Create manager invite (Super Admin only) | Supabase |
| POST | `/v1/invites/create-doctor` | Create doctor invite | Supabase + Hospital |
| GET | `/v1/invites/lookup?token=xxx` | Get invite details (public) | None |
| POST | `/v1/invites/accept` | Accept invite | Supabase |
| GET | `/v1/invites/pending` | List pending invites for hospital | Supabase + Hospital |

### Staff Module

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/v1/staff` | Create staff account | Supabase + Hospital |
| GET | `/v1/staff` | List staff accounts | Supabase + Hospital |
| PATCH | `/v1/staff/:id` | Update staff (activate/deactivate) | Supabase + Hospital |
| POST | `/v1/staff/login` | Staff login | None |
| POST | `/v1/staff/logout` | Staff logout | Staff Cookie |
| GET | `/v1/staff/me` | Get current staff user | Staff Cookie |

### Hospitals Module

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/v1/hospitals` | List all hospitals (Super Admin) | Supabase |
| POST | `/v1/hospitals` | Create hospital (Super Admin) | Supabase |
| GET | `/v1/hospitals/members` | List hospital members | Supabase + Hospital |

## Security

### Token-Based Invites
- Invite tokens are generated as random UUIDs
- Only SHA256 hash is stored in database
- Original token sent to user via email/URL
- Token validated by hashing and comparing

### Staff Authentication
- Passwords hashed with bcrypt (10 rounds)
- JWT stored in httpOnly cookie
- Separate from Supabase Auth
- Hospital-scoped (username unique per hospital)

### Row Level Security
```sql
-- Invites visible to hospital managers
CREATE POLICY "managers_see_hospital_invites" ON hospital_invites
  FOR SELECT USING (
    hospital_id IN (
      SELECT hospital_id FROM hospital_memberships
      WHERE user_id = auth.uid() AND role = 'hospital_manager'
    )
  );

-- Staff accounts visible to hospital members
CREATE POLICY "members_see_staff" ON staff_accounts
  FOR SELECT USING (
    hospital_id IN (
      SELECT hospital_id FROM hospital_memberships WHERE user_id = auth.uid()
    )
  );
```

## Frontend Pages

| Page | Path | Purpose |
|------|------|---------|
| Admin Hospitals | `/admin/hospitals` | Super Admin hospital management |
| Hospital Users | `/hospital/users` | Manager team management |
| Accept Invite | `/invite/accept` | Invite acceptance flow |
| Staff Login | `/staff/login` | Staff authentication portal |

## Environment Variables

### API (.env)
```
STAFF_JWT_SECRET=your-staff-jwt-secret
EMAIL_PROVIDER=console  # or 'sendgrid'
SENDGRID_API_KEY=       # if using sendgrid
```

### Web (.env.local)
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

## Testing the Flow

1. **Create Hospital** (as Super Admin)
   - Login at `/login` with super admin account
   - Go to `/admin/hospitals`
   - Click "Create Hospital"

2. **Invite Manager** (as Super Admin)
   - From `/admin/hospitals`, click "Invite Manager"
   - Enter email address
   - Copy the invite URL

3. **Accept Invite** (as new Manager)
   - Open invite URL in incognito
   - Create account or login
   - Click "Accept Invite"

4. **Invite Doctor** (as Manager)
   - Login and go to `/hospital/users`
   - Click "Invite Doctor"
   - Share the invite URL

5. **Create Staff** (as Manager)
   - From `/hospital/users`, go to "Staff Accounts" tab
   - Click "Create Staff Account"
   - Set username, password, role

6. **Staff Login**
   - Navigate to `/staff/login`
   - Login with username/password
   - Access staff portal
