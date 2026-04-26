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

test("POST /api/providers/:id/models adds models and returns them", async () => {
  const created = await postJson("/api/providers", {
    name: "OR",
    kind: "openrouter",
    apiKey: "k",
  });
  const { id } = (await created.json()) as { id: string };
  const r = await postJson(`/api/providers/${id}/models`, {
    models: [
      {
        modelId: "anthropic/claude-sonnet-4.6",
        displayName: "Sonnet 4.6",
        contextLength: 200000,
        inputCostPerMtok: 3.0,
        outputCostPerMtok: 15.0,
        supportedParameters: ["tools"],
      },
      { modelId: "google/gemini-3-pro", displayName: "Gemini 3" },
    ],
  });
  expect(r.status).toBe(200);
  const body = (await r.json()) as { models: Array<{ modelId: string }> };
  expect(body.models.map((m) => m.modelId).sort()).toEqual([
    "anthropic/claude-sonnet-4.6",
    "google/gemini-3-pro",
  ]);
});

test("POST /api/providers/:id/models is idempotent", async () => {
  const created = await postJson("/api/providers", {
    name: "OR",
    kind: "openrouter",
    apiKey: "k",
  });
  const { id } = (await created.json()) as { id: string };
  await postJson(`/api/providers/${id}/models`, {
    models: [{ modelId: "x", displayName: "X" }],
  });
  await postJson(`/api/providers/${id}/models`, {
    models: [{ modelId: "x", displayName: "X (renamed)" }],
  });
  const list = await (await t.fetch("/api/providers")).json() as {
    models: Array<{ modelId: string; displayName: string }>;
  };
  expect(list.models).toHaveLength(1);
  expect(list.models[0].displayName).toBe("X");
});

test("POST /api/providers/:id/models returns 404 for unknown provider", async () => {
  const r = await postJson("/api/providers/01ZZZZZZZZZZZZZZZZZZZZZZZZ/models", {
    models: [{ modelId: "x", displayName: "X" }],
  });
  expect(r.status).toBe(404);
});

test("POST /api/providers/:id/models requires models array", async () => {
  const created = await postJson("/api/providers", {
    name: "OR",
    kind: "openrouter",
    apiKey: "k",
  });
  const { id } = (await created.json()) as { id: string };
  const r = await postJson(`/api/providers/${id}/models`, {});
  expect(r.status).toBe(400);
});

test("DELETE /api/providers/:id/models/:modelId removes a model", async () => {
  const created = await postJson("/api/providers", {
    name: "OR",
    kind: "openrouter",
    apiKey: "k",
  });
  const { id } = (await created.json()) as { id: string };
  await postJson(`/api/providers/${id}/models`, {
    models: [{ modelId: "a", displayName: "A" }],
  });
  const r = await t.fetch(`/api/providers/${id}/models/a`, {
    method: "DELETE",
  });
  expect(r.status).toBe(200);
  const list = await (await t.fetch("/api/providers")).json() as {
    models: unknown[];
  };
  expect(list.models).toHaveLength(0);
});

test("DELETE /api/providers/:id/models/:modelId encodes slashes in model id", async () => {
  const created = await postJson("/api/providers", {
    name: "OR",
    kind: "openrouter",
    apiKey: "k",
  });
  const { id } = (await created.json()) as { id: string };
  await postJson(`/api/providers/${id}/models`, {
    models: [{ modelId: "anthropic/claude-sonnet-4.6", displayName: "S" }],
  });
  const encoded = encodeURIComponent("anthropic/claude-sonnet-4.6");
  const r = await t.fetch(`/api/providers/${id}/models/${encoded}`, {
    method: "DELETE",
  });
  expect(r.status).toBe(200);
});

test("POST /api/providers/:id/probe returns 404 for unknown provider", async () => {
  const r = await postJson(
    "/api/providers/01ZZZZZZZZZZZZZZZZZZZZZZZZ/probe",
    {},
  );
  expect(r.status).toBe(404);
});

test("POST /api/providers/:id/probe (openrouter) hits catalog and reports model count", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ data: [{ id: "a" }, { id: "b" }, { id: "c" }] }),
      { status: 200 },
    )) as typeof fetch;
  try {
    const created = await postJson("/api/providers", {
      name: "OR",
      kind: "openrouter",
      apiKey: "or-key",
    });
    const { id } = (await created.json()) as { id: string };
    const r = await postJson(`/api/providers/${id}/probe`, {});
    expect(r.status).toBe(200);
    const body = (await r.json()) as { ok: boolean; modelCount?: number };
    expect(body.ok).toBe(true);
    expect(body.modelCount).toBe(3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("POST /api/providers/:id/probe (openrouter) reports error on upstream failure", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("nope", { status: 401 })) as typeof fetch;
  try {
    const created = await postJson("/api/providers", {
      name: "OR",
      kind: "openrouter",
      apiKey: "bad-key",
    });
    const { id } = (await created.json()) as { id: string };
    const r = await postJson(`/api/providers/${id}/probe`, {});
    expect(r.status).toBe(200);
    const body = (await r.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.message).toMatch(/401/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("POST /api/providers/:id/probe (api_direct) verifies credentials", async () => {
  const created = await postJson("/api/providers", {
    name: "Anthropic",
    kind: "anthropic_api_direct",
    apiKey: "sk-test",
  });
  const { id } = (await created.json()) as { id: string };
  const r = await postJson(`/api/providers/${id}/probe`, {});
  const body = (await r.json()) as { ok: boolean };
  expect(body.ok).toBe(true);
});

test("POST /api/providers/:id/probe (api_direct) fails when env-ref missing", async () => {
  delete process.env.B3_PROBE_TEST_KEY;
  const created = await postJson("/api/providers", {
    name: "Anthropic",
    kind: "anthropic_api_direct",
    apiKeyEnvRef: "B3_PROBE_TEST_KEY",
  });
  const { id } = (await created.json()) as { id: string };
  const r = await postJson(`/api/providers/${id}/probe`, {});
  const body = (await r.json()) as { ok: boolean; message: string };
  expect(body.ok).toBe(false);
  expect(body.message).toMatch(/B3_PROBE_TEST_KEY/);
});

test("GET /api/providers/openrouter/catalog returns catalog for valid provider", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        data: [
          { id: "anthropic/claude-sonnet-4.6", name: "Sonnet" },
          { id: "google/gemini-3-pro", name: "Gemini" },
        ],
      }),
      { status: 200 },
    )) as typeof fetch;
  try {
    const created = await postJson("/api/providers", {
      name: "OR",
      kind: "openrouter",
      apiKey: "or-key",
    });
    const { id } = (await created.json()) as { id: string };
    const r = await t.fetch(
      `/api/providers/openrouter/catalog?providerId=${id}`,
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { data: Array<{ id: string }> };
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe("anthropic/claude-sonnet-4.6");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GET /api/providers/openrouter/catalog returns 400 without providerId", async () => {
  const r = await t.fetch("/api/providers/openrouter/catalog");
  expect(r.status).toBe(400);
});

test("GET /api/providers/openrouter/catalog returns 404 for unknown provider", async () => {
  const r = await t.fetch(
    "/api/providers/openrouter/catalog?providerId=01ZZZZZZZZZZZZZZZZZZZZZZZZ",
  );
  expect(r.status).toBe(404);
});

test("GET /api/providers/openrouter/catalog returns 404 for non-openrouter provider", async () => {
  const created = await postJson("/api/providers", {
    name: "Anthropic",
    kind: "anthropic_api_direct",
    apiKey: "k",
  });
  const { id } = (await created.json()) as { id: string };
  const r = await t.fetch(
    `/api/providers/openrouter/catalog?providerId=${id}`,
  );
  expect(r.status).toBe(404);
});

test("GET /api/providers/openrouter/catalog returns 502 on upstream failure", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("nope", { status: 401 })) as typeof fetch;
  try {
    const created = await postJson("/api/providers", {
      name: "OR",
      kind: "openrouter",
      apiKey: "bad",
    });
    const { id } = (await created.json()) as { id: string };
    const r = await t.fetch(
      `/api/providers/openrouter/catalog?providerId=${id}`,
    );
    expect(r.status).toBe(502);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("POST /api/providers/:id/probe (custom_*) requires base url", async () => {
  // baseUrl is enforced at create time (400) — we can't even create the
  // provider without it. So probe never sees a malformed custom_*; this test
  // confirms the probe also validates url shape on a hand-built row.
  const { createProvider } = await import("../src/db/providers");
  const p = createProvider(t.app.db, {
    name: "Custom",
    kind: "custom_anthropic_compat",
    apiKey: "k",
    baseUrl: "not-a-url",
  });
  const r = await postJson(`/api/providers/${p.id}/probe`, {});
  const body = (await r.json()) as { ok: boolean; message: string };
  expect(body.ok).toBe(false);
  expect(body.message).toMatch(/url/i);
});
