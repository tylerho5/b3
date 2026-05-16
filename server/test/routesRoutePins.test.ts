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
  const body = (await r.json()) as { pins: Record<string, Record<string, string>> };
  expect(body.pins).toEqual({});
});

test("PUT /api/route-pins/:model/:harness sets a pin and GET returns it nested", async () => {
  const r = await putJson("/api/route-pins/claude-sonnet-4-6/claude_code", {
    routeId: "provider-abc",
  });
  expect(r.status).toBe(200);

  const r2 = await t.fetch("/api/route-pins");
  const body = (await r2.json()) as { pins: Record<string, Record<string, string>> };
  expect(body.pins["claude-sonnet-4-6"]).toEqual({ claude_code: "provider-abc" });
});

test("PUT /api/route-pins/:model/:harness returns 400 when routeId is missing", async () => {
  const r = await putJson("/api/route-pins/some-model/claude_code", {});
  expect(r.status).toBe(400);
});

test("PUT /api/route-pins/:model/:harness upserts — same harness replaces, different harness independent", async () => {
  await putJson("/api/route-pins/glm-5/claude_code", { routeId: "route-1" });
  await putJson("/api/route-pins/glm-5/claude_code", { routeId: "route-2" });
  await putJson("/api/route-pins/glm-5/codex", { routeId: "route-x" });

  const r = await t.fetch("/api/route-pins");
  const body = (await r.json()) as { pins: Record<string, Record<string, string>> };
  expect(body.pins["glm-5"]).toEqual({ claude_code: "route-2", codex: "route-x" });
});

test("DELETE /api/route-pins/:model/:harness removes the pin", async () => {
  await putJson("/api/route-pins/qwen3-coder/claude_code", { routeId: "alibaba" });
  const r = await del("/api/route-pins/qwen3-coder/claude_code");
  expect(r.status).toBe(200);

  const r2 = await t.fetch("/api/route-pins");
  const body = (await r2.json()) as { pins: Record<string, Record<string, string>> };
  expect(body.pins["qwen3-coder"]).toBeUndefined();
});

test("DELETE /api/route-pins/:model/:harness only removes the specified harness", async () => {
  await putJson("/api/route-pins/model-x/claude_code", { routeId: "r1" });
  await putJson("/api/route-pins/model-x/codex", { routeId: "r2" });
  const r = await del("/api/route-pins/model-x/claude_code");
  expect(r.status).toBe(200);

  const r2 = await t.fetch("/api/route-pins");
  const body = (await r2.json()) as { pins: Record<string, Record<string, string>> };
  expect(body.pins["model-x"]).toEqual({ codex: "r2" });
});

test("DELETE /api/route-pins/:model/:harness is idempotent for non-existent", async () => {
  const r = await del("/api/route-pins/nonexistent-model/claude_code");
  expect(r.status).toBe(200);
});

test("model names with slashes are encoded and decoded correctly", async () => {
  const encoded = encodeURIComponent("vendor/model-name");
  await putJson(`/api/route-pins/${encoded}/claude_code`, { routeId: "some-provider" });

  const r = await t.fetch("/api/route-pins");
  const body = (await r.json()) as { pins: Record<string, Record<string, string>> };
  expect(body.pins["vendor/model-name"]).toEqual({ claude_code: "some-provider" });
});
