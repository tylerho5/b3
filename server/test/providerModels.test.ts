import { test, expect, beforeEach } from "bun:test";
import { openDb, type DB } from "../src/db";
import { runMigrations } from "../src/db/migrations";
import { createProvider } from "../src/db/providers";
import { upsertCatalogRow } from "../src/db/openrouterCatalog";
import {
  addProviderModels,
  getProviderModel,
  listProviderModels,
  removeProviderModel,
  updateProviderModel,
  backfillCanonicalIds,
} from "../src/db/providerModels";

let db: DB;
let providerId: string;
beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
  providerId = createProvider(db, { name: "OR", kind: "openrouter" }).id;
});

test("addProviderModels inserts new rows and returns them", () => {
  const added = addProviderModels(db, providerId, [
    {
      modelId: "anthropic/claude-sonnet-4.6",
      displayName: "Claude Sonnet 4.6",
      contextLength: 200000,
      inputCostPerMtok: 3.0,
      outputCostPerMtok: 15.0,
      supportedParameters: ["tools", "reasoning"],
    },
  ]);
  expect(added).toHaveLength(1);
  expect(added[0].modelId).toBe("anthropic/claude-sonnet-4.6");
  expect(added[0].supportedParameters).toEqual(["tools", "reasoning"]);
});

test("addProviderModels is idempotent on (provider_id, model_id)", () => {
  addProviderModels(db, providerId, [{ modelId: "x", displayName: "X" }]);
  addProviderModels(db, providerId, [
    { modelId: "x", displayName: "X (renamed)" },
  ]);
  const all = listProviderModels(db, providerId);
  expect(all).toHaveLength(1);
  expect(all[0].displayName).toBe("X");
});

test("getProviderModel returns null when absent", () => {
  expect(getProviderModel(db, providerId, "missing")).toBeNull();
});

test("removeProviderModel deletes by (providerId, modelId)", () => {
  addProviderModels(db, providerId, [{ modelId: "x", displayName: "X" }]);
  removeProviderModel(db, providerId, "x");
  expect(listProviderModels(db, providerId)).toHaveLength(0);
});

test("listProviderModels returns only rows for that provider", () => {
  Bun.sleepSync(2);
  const otherId = createProvider(db, { name: "B", kind: "openrouter" }).id;
  addProviderModels(db, providerId, [{ modelId: "a", displayName: "A" }]);
  addProviderModels(db, otherId, [{ modelId: "b", displayName: "B" }]);
  expect(listProviderModels(db, providerId).map((m) => m.modelId)).toEqual(["a"]);
  expect(listProviderModels(db, otherId).map((m) => m.modelId)).toEqual(["b"]);
});

test("supportedParameters JSON round-trips correctly when null", () => {
  const [m] = addProviderModels(db, providerId, [
    { modelId: "y", displayName: "Y" },
  ]);
  expect(m.supportedParameters).toBeNull();
});

test("canonicalId populated when catalog has match", () => {
  upsertCatalogRow(db, {
    id: "moonshotai/kimi-k2.6",
    name: "Kimi K2.6",
    contextLength: null,
    pricingPrompt: null,
    pricingCompletion: null,
    supportedParameters: null,
    description: null,
    fetchedAt: 1,
  });
  const [m] = addProviderModels(db, providerId, [
    { modelId: "kimi-k2.6", displayName: "Kimi K2.6" },
  ]);
  expect(m.canonicalId).toBe("moonshotai/kimi-k2.6");
});

test("canonicalId is null when catalog has no match", () => {
  upsertCatalogRow(db, {
    id: "anthropic/claude-opus-4-7",
    name: "Opus",
    contextLength: null,
    pricingPrompt: null,
    pricingCompletion: null,
    supportedParameters: null,
    description: null,
    fetchedAt: 1,
  });
  const [m] = addProviderModels(db, providerId, [
    { modelId: "unknown-model", displayName: "Unknown" },
  ]);
  expect(m.canonicalId).toBeNull();
});

test("removeProviderModel works with canonical_id set", () => {
  upsertCatalogRow(db, {
    id: "moonshotai/kimi-k2.6",
    name: "Kimi K2.6",
    contextLength: null,
    pricingPrompt: null,
    pricingCompletion: null,
    supportedParameters: null,
    description: null,
    fetchedAt: 1,
  });
  const [m] = addProviderModels(db, providerId, [
    { modelId: "kimi-k2.6", displayName: "Kimi K2.6" },
  ]);
  expect(m.canonicalId).not.toBeNull();
  removeProviderModel(db, providerId, m.modelId);
  expect(listProviderModels(db, providerId).length).toBe(0);
});

test("updateProviderModel updates editable fields", () => {
  const [m] = addProviderModels(db, providerId, [
    { modelId: "gpt-5.5", displayName: "GPT 5.5" },
  ]);
  const updated = updateProviderModel(db, providerId, m.modelId, {
    displayName: "GPT 5.5 Updated",
    tier: "opus",
    contextLength: 256000,
    inputCostPerMtok: 15,
    outputCostPerMtok: 60,
    supportedParameters: ["temperature", "top_p"],
  });
  expect(updated).not.toBeNull();
  expect(updated!.displayName).toBe("GPT 5.5 Updated");
  expect(updated!.tier).toBe("opus");
  expect(updated!.contextLength).toBe(256000);
  expect(updated!.inputCostPerMtok).toBe(15);
  expect(updated!.outputCostPerMtok).toBe(60);
  expect(updated!.supportedParameters).toEqual(["temperature", "top_p"]);
  expect(updated!.modelId).toBe("gpt-5.5");
});

test("updateProviderModel returns null for missing row", () => {
  const r = updateProviderModel(db, providerId, "nonexistent", {
    displayName: "x",
  });
  expect(r).toBeNull();
});

test("backfillCanonicalIds populates null canonical_id rows", () => {
  upsertCatalogRow(db, {
    id: "moonshotai/kimi-k2.6",
    name: "Kimi K2.6",
    contextLength: null,
    pricingPrompt: null,
    pricingCompletion: null,
    supportedParameters: null,
    description: null,
    fetchedAt: 1,
  });
  // Insert directly to bypass addProviderModels canonical resolution
  db.run(
    "INSERT INTO provider_models (id, provider_id, model_id, display_name, added_at) VALUES (?, ?, ?, ?, ?)",
    ["m1", providerId, "kimi-k2.6", "Kimi K2.6", "2026-01-01"],
  );
  const count = backfillCanonicalIds(db);
  expect(count).toBe(1);
  const models = listProviderModels(db, providerId);
  expect(models[0].canonicalId).toBe("moonshotai/kimi-k2.6");
});

test("backfillCanonicalIds returns 0 when nothing to backfill", () => {
  const count = backfillCanonicalIds(db);
  expect(count).toBe(0);
});
