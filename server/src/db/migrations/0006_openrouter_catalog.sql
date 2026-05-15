-- 0006_openrouter_catalog.sql
CREATE TABLE openrouter_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vendor TEXT NOT NULL,
  context_length INTEGER,
  pricing_prompt TEXT,
  pricing_completion TEXT,
  supported_parameters TEXT,
  description TEXT,
  fetched_at INTEGER NOT NULL
);

ALTER TABLE provider_models ADD COLUMN canonical_id TEXT;

CREATE INDEX idx_provider_models_canonical_id
  ON provider_models(canonical_id)
  WHERE canonical_id IS NOT NULL;
