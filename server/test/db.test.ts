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
  expect(names).toContain("providers_cache");
  expect(names).toContain("schema_migrations");
});

test("migrations are idempotent", () => {
  const db = openDb(":memory:");
  runMigrations(db);
  runMigrations(db);
  const v = db
    .query("SELECT MAX(version) AS v FROM schema_migrations")
    .get() as { v: number };
  expect(v.v).toBe(1);
});
