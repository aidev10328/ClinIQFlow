-- Migration 016: Add title column to hospital_memberships for staff
-- Title is hospital-specific (e.g., "Receptionist", "Front Desk", "Billing Coordinator")

ALTER TABLE hospital_memberships ADD COLUMN IF NOT EXISTS title TEXT;
