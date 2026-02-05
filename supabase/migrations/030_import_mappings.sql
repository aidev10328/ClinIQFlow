-- ============================================================================
-- CliniQFlow Step 30: Import Mappings for Excel Bulk Import
-- ============================================================================

CREATE TABLE import_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    name TEXT NOT NULL,
    mapping_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_entity_type CHECK (entity_type IN ('patients', 'doctors')),
    CONSTRAINT unique_mapping_name UNIQUE (hospital_id, entity_type, name)
);

CREATE INDEX idx_import_mappings_hospital ON import_mappings(hospital_id);
CREATE INDEX idx_import_mappings_entity ON import_mappings(entity_type);

CREATE TRIGGER update_import_mappings_updated_at
    BEFORE UPDATE ON import_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE import_mappings ENABLE ROW LEVEL SECURITY;

GRANT ALL ON import_mappings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON import_mappings TO authenticated;
