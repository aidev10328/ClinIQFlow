-- Enforce unique phone number per hospital for patients
-- Only applies when phone is not null (multiple patients can have no phone)
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_hospital_phone_unique
  ON patients (hospital_id, phone)
  WHERE phone IS NOT NULL;
