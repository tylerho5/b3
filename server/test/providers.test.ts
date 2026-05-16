import { test, expect, beforeEach } from "bun:test";
import { openDb, type DB } from "../src/db";
import { runMigrations } from "../src/db/migrations";
import {
  createProvider,
  getProvider,
  listProviders,
  updateProvider,
  deleteProvider,
  type ProviderKind,
} from "../src/db/providers";

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
});

test("createProvider + getProvider round-trip", () => {
  const p = createProvider(db, {
    name: "OpenRouter",
    kind: "openrouter",
    apiKey: "or-key-123",
  });
  expect(p.id).toMatch(/^[0-9A-Z]{26}$/);
  expect(p.name).toBe("OpenRouter");
  expect(p.kind).toBe("openrouter");
  expect(p.apiKey).toBe("or-key-123");
  expect(p.apiKeyEnvRef).toBeNull();
  expect(p.baseUrl).toBeNull();

  const got = getProvider(db, p.id);
  expect(got).toEqual(p);
});

test("createProvider with env-ref instead of literal key", () => {
  const p = createProvider(db, {
    name: "Anthropic",
    kind: "anthropic_api_direct",
    apiKeyEnvRef: "ANTHROPIC_API_KEY",
  });
  expect(p.apiKey).toBeNull();
  expect(p.apiKeyEnvRef).toBe("ANTHROPIC_API_KEY");
});

test("listProviders returns rows in insertion order", () => {
  const a = createProvider(db, { name: "A", kind: "openrouter" });
  Bun.sleepSync(2);
  const b = createProvider(db, { name: "B", kind: "claude_subscription" });
  const all = listProviders(db);
  expect(all.map((p) => p.id)).toEqual([a.id, b.id]);
});

test("updateProvider patches fields, bumps updated_at", () => {
  const p = createProvider(db, { name: "old", kind: "openrouter" });
  const original = p.updatedAt;
  Bun.sleepSync(10);
  const updated = updateProvider(db, p.id, { name: "new" });
  expect(updated.name).toBe("new");
  expect(updated.updatedAt).not.toBe(original);
});

test("deleteProvider removes the row", () => {
  const p = createProvider(db, { name: "x", kind: "openrouter" });
  deleteProvider(db, p.id);
  expect(getProvider(db, p.id)).toBeNull();
});

test("createProvider rejects invalid kind", () => {
  expect(() =>
    createProvider(db, { name: "x", kind: "totally_fake" as ProviderKind }),
  ).toThrow();
});
