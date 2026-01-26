-- ============================================================================
-- ClinQflow Step 6: Patients Management
-- Migration: 006_patients
-- ============================================================================

-- ============================================================================
-- 1. PATIENTS TABLE
-- ============================================================================

CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,

    -- Personal Information
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    date_of_birth DATE,
    gender TEXT,

    -- Address
    address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT,

    -- Insurance
    insurance_provider TEXT,
    insurance_number TEXT,

    -- Emergency Contact
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,

    -- Notes
    notes TEXT,

    -- Status
    status TEXT NOT NULL DEFAULT 'active',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT valid_patient_status CHECK (status IN ('active', 'inactive')),
    CONSTRAINT valid_patient_gender CHECK (gender IS NULL OR gender IN ('male', 'female', 'other'))
);

-- Indexes for performance
CREATE INDEX idx_patients_hospital_id ON patients(hospital_id);
CREATE INDEX idx_patients_status ON patients(status);
CREATE INDEX idx_patients_name ON patients(last_name, first_name);
CREATE INDEX idx_patients_email ON patients(email) WHERE email IS NOT NULL;
CREATE INDEX idx_patients_phone ON patients(phone) WHERE phone IS NOT NULL;

-- Trigger for updated_at
CREATE TRIGGER update_patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. ENABLE RLS
-- ============================================================================

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================

-- Super admins can do everything
CREATE POLICY "Super admins full access to patients"
    ON patients FOR ALL
    USING (current_user_is_super_admin());

-- Hospital managers can manage patients in their hospital
CREATE POLICY "Hospital managers can manage patients"
    ON patients FOR ALL
    USING (is_hospital_manager(auth.uid(), hospital_id));

-- Doctors can view patients in their hospital
CREATE POLICY "Doctors can view patients"
    ON patients FOR SELECT
    USING (user_has_membership(auth.uid(), hospital_id));

-- ============================================================================
-- 4. DOCTOR PROFILES TABLE (Extended doctor information)
-- ============================================================================

CREATE TABLE doctor_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,

    -- Personal
    phone TEXT,
    date_of_birth DATE,
    gender TEXT,
    address TEXT,
    emergency_contact TEXT,
    emergency_phone TEXT,

    -- Professional
    specialization TEXT,
    license_number TEXT,
    years_of_experience INTEGER,
    education TEXT,
    certifications JSONB DEFAULT '[]'::jsonb,
    bio TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Unique constraint
    UNIQUE(user_id, hospital_id)
);

-- Indexes
CREATE INDEX idx_doctor_profiles_user_id ON doctor_profiles(user_id);
CREATE INDEX idx_doctor_profiles_hospital_id ON doctor_profiles(hospital_id);

-- Trigger for updated_at
CREATE TRIGGER update_doctor_profiles_updated_at
    BEFORE UPDATE ON doctor_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE doctor_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Super admins full access to doctor_profiles"
    ON doctor_profiles FOR ALL
    USING (current_user_is_super_admin());

CREATE POLICY "Hospital managers can manage doctor_profiles"
    ON doctor_profiles FOR ALL
    USING (is_hospital_manager(auth.uid(), hospital_id));

CREATE POLICY "Doctors can view own profile"
    ON doctor_profiles FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Doctors can update own profile"
    ON doctor_profiles FOR UPDATE
    USING (user_id = auth.uid());

-- ============================================================================
-- 5. DOCTOR SCHEDULES TABLE
-- ============================================================================

CREATE TABLE doctor_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_profile_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,

    -- Working schedule (day 0 = Sunday, 6 = Saturday)
    day_of_week INTEGER NOT NULL,
    is_working BOOLEAN NOT NULL DEFAULT true,

    -- Shift times
    shift_start TIME,
    shift_end TIME,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT valid_day_of_week CHECK (day_of_week >= 0 AND day_of_week <= 6),
    UNIQUE(doctor_profile_id, day_of_week)
);

-- Indexes
CREATE INDEX idx_doctor_schedules_profile_id ON doctor_schedules(doctor_profile_id);

-- Trigger for updated_at
CREATE TRIGGER update_doctor_schedules_updated_at
    BEFORE UPDATE ON doctor_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE doctor_schedules ENABLE ROW LEVEL SECURITY;

-- RLS Policies (inherit from doctor_profiles)
CREATE POLICY "Super admins full access to doctor_schedules"
    ON doctor_schedules FOR ALL
    USING (current_user_is_super_admin());

CREATE POLICY "Hospital managers can manage doctor_schedules"
    ON doctor_schedules FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM doctor_profiles dp
            WHERE dp.id = doctor_schedules.doctor_profile_id
            AND is_hospital_manager(auth.uid(), dp.hospital_id)
        )
    );

CREATE POLICY "Doctors can manage own schedules"
    ON doctor_schedules FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM doctor_profiles dp
            WHERE dp.id = doctor_schedules.doctor_profile_id
            AND dp.user_id = auth.uid()
        )
    );

-- ============================================================================
-- 6. DOCTOR TIME OFF TABLE
-- ============================================================================

CREATE TABLE doctor_time_off (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_profile_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,

    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'approved',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT valid_time_off_dates CHECK (end_date >= start_date),
    CONSTRAINT valid_time_off_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Indexes
CREATE INDEX idx_doctor_time_off_profile_id ON doctor_time_off(doctor_profile_id);
CREATE INDEX idx_doctor_time_off_dates ON doctor_time_off(start_date, end_date);

-- Trigger for updated_at
CREATE TRIGGER update_doctor_time_off_updated_at
    BEFORE UPDATE ON doctor_time_off
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE doctor_time_off ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Super admins full access to doctor_time_off"
    ON doctor_time_off FOR ALL
    USING (current_user_is_super_admin());

CREATE POLICY "Hospital managers can manage doctor_time_off"
    ON doctor_time_off FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM doctor_profiles dp
            WHERE dp.id = doctor_time_off.doctor_profile_id
            AND is_hospital_manager(auth.uid(), dp.hospital_id)
        )
    );

CREATE POLICY "Doctors can manage own time_off"
    ON doctor_time_off FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM doctor_profiles dp
            WHERE dp.id = doctor_time_off.doctor_profile_id
            AND dp.user_id = auth.uid()
        )
    );
