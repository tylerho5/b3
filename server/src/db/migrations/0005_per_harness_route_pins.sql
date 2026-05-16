DROP TABLE IF EXISTS model_route_pins;
CREATE TABLE model_route_pins (
  model_name TEXT NOT NULL,
  harness    TEXT NOT NULL,
  route_id   TEXT NOT NULL,
  PRIMARY KEY (model_name, harness)
);
