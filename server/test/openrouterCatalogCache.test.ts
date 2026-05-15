import { test, expect, beforeEach } from "bun:test";
import { openDb } from "../src/db";
import { runMigrations } from "../src/db/migrations";
import { listCatalog } from "../src/db/openrouterCatalog";
import { listAllProviderModels } from "../src/db/providerModels";
import { refreshCatalog } from "../src/providers/openrouterCatalogCache";
import type { DB } from "../src/db";
import type { OpenRouterCatalog } from "../src/providers/openrouter";

const stubCatalog: OpenRouterCatalog = {
  data: [
    {
      id: "moonshotai/kimi-k2.6",
      name: "Kimi K2.6",
      context_length: 128000,
      pricing: { prompt: "0.000001", completion: "0.000001" },
      supported_parameters: ["temperature"],
      description: "Moonshot model",
    },
    {
      id: "anthropic/claude-opus-4-7",
      name: "Claude Opus 4.7",
      context_length: 200000,
      pricing: { prompt: "0.000015", completion: "0.000075" },
    },
  ],
};

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
  db.run(
    "INSERT INTO providers (id, name, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ["p1", "test", "custom_anthropic_compat", "2026-01-01", "2026-01-01"],
  );
});

test("refreshCatalog upserts rows from catalog", async () => {
  await refreshCatalog(db, { catalogOverride: stubCatalog });
  const rows = listCatalog(db);
  expect(rows.length).toBe(2);
  expect(rows[0].id).toBe("anthropic/claude-opus-4-7");
  expect(rows[0].vendor).toBe("anthropic");
  expect(rows[0].contextLength).toBe(200000);
  expect(rows[1].id).toBe("moonshotai/kimi-k2.6");
  expect(rows[1].vendor).toBe("moonshotai");
  expect(rows[1].pricingPrompt).toBe("0.000001");
});

test("refreshCatalog on fetch failure does not throw", async () => {
  await refreshCatalog(db, {
    catalogOverride: null,
    // null catalogOverride means "simulate failure"
  });
  // No exception thrown, catalog unchanged
  expect(listCatalog(db).length).toBe(0);
});

test("refreshCatalog backfills canonical_id on existing rows", async () => {
  // Insert a model row without canonical_id (simulating pre-catalog state)
  db.run(
    "INSERT INTO provider_models (id, provider_id, model_id, display_name, added_at) VALUES (?, ?, ?, ?, ?)",
    ["m1", "p1", "kimi-k2.6", "Kimi K2.6", "2026-01-01"],
  );
  await refreshCatalog(db, { catalogOverride: stubCatalog });
  const models = listAllProviderModels(db);
  expect(models[0].canonicalId).toBe("moonshotai/kimi-k2.6");
});
