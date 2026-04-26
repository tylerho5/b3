CREATE TABLE recent_models (
  model_name TEXT PRIMARY KEY,
  last_used_at INTEGER NOT NULL
);

CREATE TABLE model_route_pins (
  model_name TEXT PRIMARY KEY,
  route_id   TEXT NOT NULL
);
