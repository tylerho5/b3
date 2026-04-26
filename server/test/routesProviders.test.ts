import { test, expect, beforeEach, afterEach } from "bun:test";
import { createTestApp, type TestApp } from "./_helpers";
import { createProvider } from "../src/db/providers";
import { addProviderModels } from "../src/db/providerModels";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => {
  t.cleanup();
});

test("GET /api/providers returns providers and models from DB", async () => {
  const p = createProvider(t.app.db, {
    name: "OR",
    kind: "openrouter",
    apiKey: "k",
  });
  addProviderModels(t.app.db, p.id, [
    { modelId: "anthropic/claude-sonnet-4.6", displayName: "Sonnet" },
  ]);

  const r = await t.fetch("/api/providers");
  expect(r.status).toBe(200);
  const body = (await r.json()) as {
    providers: Array<{ id: string; name: string; kind: string; apiKey: string | null }>;
    models: Array<{ providerId: string; modelId: string }>;
  };
  expect(body.providers).toHaveLength(1);
  expect(body.providers[0].name).toBe("OR");
  expect(body.providers[0].kind).toBe("openrouter");
  expect(body.providers[0].apiKey).toBe("k");
  expect(body.models).toHaveLength(1);
  expect(body.models[0].providerId).toBe(p.id);
  expect(body.models[0].modelId).toBe("anthropic/claude-sonnet-4.6");
});

test("GET /api/providers returns empty arrays on fresh DB", async () => {
  const r = await t.fetch("/api/providers");
  const body = (await r.json()) as {
    providers: unknown[];
    models: unknown[];
  };
  expect(body.providers).toEqual([]);
  expect(body.models).toEqual([]);
});

test("PUT /api/providers returns 410 (legacy TOML write removed)", async () => {
  const r = await t.fetch("/api/providers", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ toml: "version = 1" }),
  });
  expect(r.status).toBe(410);
});
