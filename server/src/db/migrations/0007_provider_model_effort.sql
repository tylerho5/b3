-- Adds an `effort` axis to provider_models so subscription harness models
-- can store multiple (model, effort) variants. Existing rows migrate to
-- effort = '' (treated as "no effort axis applies" for non-subscription kinds).
PRAGMA foreign_keys = OFF;

CREATE TABLE provider_models_new (
  id                     TEXT PRIMARY KEY,
  provider_id            TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  model_id               TEXT NOT NULL,
  display_name           TEXT NOT NULL,
  context_length         INTEGER,
  input_cost_per_mtok    REAL,
  output_cost_per_mtok   REAL,
  tier                   TEXT,
  effort                 TEXT NOT NULL DEFAULT '',
  supported_parameters   TEXT,
  canonical_id           TEXT,
  added_at               TEXT NOT NULL,
  UNIQUE(provider_id, model_id, effort)
);

INSERT INTO provider_models_new
  (id, provider_id, model_id, display_name, context_length,
   input_cost_per_mtok, output_cost_per_mtok, tier, effort,
   supported_parameters, canonical_id, added_at)
SELECT
  id, provider_id, model_id, display_name, context_length,
  input_cost_per_mtok, output_cost_per_mtok, tier, '',
  supported_parameters, canonical_id, added_at
FROM provider_models;

DROP TABLE provider_models;
ALTER TABLE provider_models_new RENAME TO provider_models;

CREATE INDEX idx_provider_models_provider_id ON provider_models(provider_id);
CREATE INDEX idx_provider_models_canonical_id
  ON provider_models(canonical_id)
  WHERE canonical_id IS NOT NULL;

PRAGMA foreign_keys = ON;
