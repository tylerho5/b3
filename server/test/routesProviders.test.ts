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

async function postJson(path: string, body: unknown): Promise<Response> {
  return t.fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function patchJson(path: string, body: unknown): Promise<Response> {
  return t.fetch(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("POST /api/providers creates a provider and returns it", async () => {
  const r = await postJson("/api/providers", {
    name: "OR",
    kind: "openrouter",
    apiKey: "or-key",
  });
  expect(r.status).toBe(200);
  const body = (await r.json()) as { id: string; name: string; kind: string; apiKey: string };
  expect(body.id).toMatch(/^[0-9A-Z]{26}$/);
  expect(body.name).toBe("OR");
  expect(body.kind).toBe("openrouter");
  expect(body.apiKey).toBe("or-key");
});

test("POST /api/providers rejects invalid kind with 400", async () => {
  const r = await postJson("/api/providers", {
    name: "x",
    kind: "totally_fake",
  });
  expect(r.status).toBe(400);
});

test("POST /api/providers rejects custom_anthropic_compat without baseUrl", async () => {
  const r = await postJson("/api/providers", {
    name: "x",
    kind: "custom_anthropic_compat",
    apiKey: "k",
  });
  expect(r.status).toBe(400);
  const body = (await r.json()) as { error: string };
  expect(body.error).toMatch(/base.?url/i);
});

test("POST /api/providers rejects api kinds without credentials", async () => {
  const r = await postJson("/api/providers", {
    name: "x",
    kind: "anthropic_api_direct",
  });
  expect(r.status).toBe(400);
  const body = (await r.json()) as { error: string };
  expect(body.error).toMatch(/credential/i);
});

test("POST /api/providers accepts subscription kinds without credentials", async () => {
  const r = await postJson("/api/providers", {
    name: "Claude sub",
    kind: "claude_subscription",
  });
  expect(r.status).toBe(200);
});

test("POST /api/providers requires name and kind", async () => {
  const r = await postJson("/api/providers", { kind: "openrouter" });
  expect(r.status).toBe(400);
});

test("PATCH /api/providers/:id updates fields", async () => {
  const created = await postJson("/api/providers", {
    name: "old",
    kind: "openrouter",
    apiKey: "k1",
  });
  const { id } = (await created.json()) as { id: string };
  const r = await patchJson(`/api/providers/${id}`, { name: "new" });
  expect(r.status).toBe(200);
  const body = (await r.json()) as { name: string };
  expect(body.name).toBe("new");
});

test("PATCH /api/providers/:id returns 404 for unknown id", async () => {
  const r = await patchJson("/api/providers/01ZZZZZZZZZZZZZZZZZZZZZZZZ", {
    name: "x",
  });
  expect(r.status).toBe(404);
});

test("DELETE /api/providers/:id removes provider and cascades models", async () => {
  const created = await postJson("/api/providers", {
    name: "OR",
    kind: "openrouter",
    apiKey: "k",
  });
  const { id } = (await created.json()) as { id: string };
  // Add a model directly to verify cascade.
  const { addProviderModels } = await import("../src/db/providerModels");
  addProviderModels(t.app.db, id, [{ modelId: "m", displayName: "M" }]);

  const r = await t.fetch(`/api/providers/${id}`, { method: "DELETE" });
  expect(r.status).toBe(200);

  const list = await (await t.fetch("/api/providers")).json() as {
    providers: unknown[];
    models: unknown[];
  };
  expect(list.providers).toHaveLength(0);
  expect(list.models).toHaveLength(0);
});

test("DELETE /api/providers/:id returns 404 for unknown id", async () => {
  const r = await t.fetch("/api/providers/01ZZZZZZZZZZZZZZZZZZZZZZZZ", {
    method: "DELETE",
  });
  expect(r.status).toBe(404);
});
