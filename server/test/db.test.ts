import { test, expect } from "bun:test";
import { openDb } from "../src/db";
import { runMigrations } from "../src/db/migrations";

test("openDb creates tables on first run", () => {
  const db = openDb(":memory:");
  runMigrations(db);
  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[];
  const names = tables.map((t) => t.name);
  expect(names).toContain("tasks");
  expect(names).toContain("matrix_runs");
  expect(names).toContain("runs");
  expect(names).toContain("run_segments");
  expect(names).toContain("events");
  expect(names).toContain("skill_bundles");
  expect(names).toContain("schema_migrations");
  expect(names).not.toContain("providers_cache");
});

test("migrations are idempotent", () => {
  const db = openDb(":memory:");
  runMigrations(db);
  runMigrations(db);
  const v = db
    .query("SELECT MAX(version) AS v FROM schema_migrations")
    .get() as { v: number };
  expect(v.v).toBeGreaterThanOrEqual(1);
});

test("migration 0002 creates providers, provider_models, and app_settings tables", () => {
  const db = openDb(":memory:");
  runMigrations(db);
  const tables = (
    db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[]
  ).map((r) => r.name);
  expect(tables).toContain("providers");
  expect(tables).toContain("provider_models");
  expect(tables).toContain("app_settings");

  const providerCols = (
    db.query("PRAGMA table_info(providers)").all() as { name: string }[]
  ).map((r) => r.name);
  expect(providerCols).toEqual(
    expect.arrayContaining([
      "id",
      "name",
      "kind",
      "base_url",
      "api_key",
      "api_key_env_ref",
      "created_at",
      "updated_at",
    ]),
  );

  const pmCols = (
    db.query("PRAGMA table_info(provider_models)").all() as { name: string }[]
  ).map((r) => r.name);
  expect(pmCols).toEqual(
    expect.arrayContaining([
      "id",
      "provider_id",
      "model_id",
      "display_name",
      "context_length",
      "input_cost_per_mtok",
      "output_cost_per_mtok",
      "tier",
      "supported_parameters",
      "added_at",
    ]),
  );
});

test("provider_models cascades on provider delete", () => {
  const db = openDb(":memory:");
  runMigrations(db);
  db.run(
    "INSERT INTO providers (id, name, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ["p1", "test", "openai_api_direct", "2026-01-01", "2026-01-01"],
  );
  db.run(
    "INSERT INTO provider_models (id, provider_id, model_id, display_name, added_at) VALUES (?, ?, ?, ?, ?)",
    ["m1", "p1", "gpt-x", "GPT X", "2026-01-01"],
  );
  db.run("DELETE FROM providers WHERE id = ?", ["p1"]);
  const remaining = db
    .query("SELECT COUNT(*) AS c FROM provider_models")
    .get() as { c: number };
  expect(remaining.c).toBe(0);
});
