-- Adds an `effort` column to runs so effort variants of the same model
-- are distinguishable in the grid, history, and estimates.
ALTER TABLE runs ADD COLUMN effort TEXT NOT NULL DEFAULT '';
