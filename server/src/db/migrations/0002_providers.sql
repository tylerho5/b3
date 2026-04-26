CREATE TABLE providers (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL,
  base_url        TEXT,
  api_key         TEXT,
  api_key_env_ref TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE provider_models (
  id                     TEXT PRIMARY KEY,
  provider_id            TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  model_id               TEXT NOT NULL,
  display_name           TEXT NOT NULL,
  context_length         INTEGER,
  input_cost_per_mtok    REAL,
  output_cost_per_mtok   REAL,
  tier                   TEXT,
  supported_parameters   TEXT,
  added_at               TEXT NOT NULL,
  UNIQUE(provider_id, model_id)
);

CREATE INDEX idx_provider_models_provider_id ON provider_models(provider_id);

CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
