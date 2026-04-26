import { test, expect, beforeEach, afterEach } from "bun:test";
import { createTestApp, type TestApp } from "./_helpers";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => {
  t.cleanup();
});

async function putJson(path: string, body: unknown): Promise<Response> {
  return t.fetch(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function del(path: string): Promise<Response> {
  return t.fetch(path, { method: "DELETE" });
}

test("GET /api/route-pins returns empty record on fresh DB", async () => {
  const r = await t.fetch("/api/route-pins");
  expect(r.status).toBe(200);
  const body = (await r.json()) as { pins: Record<string, string> };
  expect(body.pins).toEqual({});
});

test("PUT /api/route-pins/:model sets a pin and GET returns it", async () => {
  const r = await putJson("/api/route-pins/claude-sonnet-4-6", {
    routeId: "provider-abc",
  });
  expect(r.status).toBe(200);

  const r2 = await t.fetch("/api/route-pins");
  const body = (await r2.json()) as { pins: Record<string, string> };
  expect(body.pins["claude-sonnet-4-6"]).toBe("provider-abc");
});

test("PUT /api/route-pins/:model returns 400 when routeId is missing", async () => {
  const r = await putJson("/api/route-pins/some-model", {});
  expect(r.status).toBe(400);
});

test("PUT /api/route-pins/:model upserts — second PUT replaces the route", async () => {
  await putJson("/api/route-pins/glm-5", { routeId: "route-1" });
  await putJson("/api/route-pins/glm-5", { routeId: "route-2" });

  const r = await t.fetch("/api/route-pins");
  const body = (await r.json()) as { pins: Record<string, string> };
  expect(body.pins["glm-5"]).toBe("route-2");
});

test("DELETE /api/route-pins/:model removes the pin", async () => {
  await putJson("/api/route-pins/qwen3-coder", { routeId: "alibaba" });
  const r = await del("/api/route-pins/qwen3-coder");
  expect(r.status).toBe(200);

  const r2 = await t.fetch("/api/route-pins");
  const body = (await r2.json()) as { pins: Record<string, string> };
  expect(body.pins["qwen3-coder"]).toBeUndefined();
});

test("DELETE /api/route-pins/:model is idempotent for non-existent model", async () => {
  const r = await del("/api/route-pins/nonexistent-model");
  expect(r.status).toBe(200);
});

test("model names with slashes are encoded and decoded correctly", async () => {
  const encoded = encodeURIComponent("vendor/model-name");
  await putJson(`/api/route-pins/${encoded}`, { routeId: "some-provider" });

  const r = await t.fetch("/api/route-pins");
  const body = (await r.json()) as { pins: Record<string, string> };
  expect(body.pins["vendor/model-name"]).toBe("some-provider");
});
