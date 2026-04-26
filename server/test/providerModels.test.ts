import { test, expect, beforeEach } from "bun:test";
import { openDb, type DB } from "../src/db";
import { runMigrations } from "../src/db/migrations";
import { createProvider } from "../src/db/providers";
import {
  addProviderModels,
  getProviderModel,
  listProviderModels,
  removeProviderModel,
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
