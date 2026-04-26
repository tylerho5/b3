import { test, expect, beforeEach, afterEach } from "bun:test";
import { createTestApp, type TestApp } from "./_helpers";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => {
  t.cleanup();
});

async function postJson(path: string, body: unknown): Promise<Response> {
  return t.fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("GET /api/recents returns empty list on fresh DB", async () => {
  const r = await t.fetch("/api/recents");
  expect(r.status).toBe(200);
  const body = (await r.json()) as { models: string[] };
  expect(body.models).toEqual([]);
});

test("POST /api/recents records a model and GET returns it", async () => {
  const r = await postJson("/api/recents", { modelName: "claude-sonnet-4-6" });
  expect(r.status).toBe(200);

  const r2 = await t.fetch("/api/recents");
  const body = (await r2.json()) as { models: string[] };
  expect(body.models).toContain("claude-sonnet-4-6");
});

test("POST /api/recents returns 400 when modelName is missing", async () => {
  const r = await postJson("/api/recents", {});
  expect(r.status).toBe(400);
});

test("GET /api/recents returns all posted models", async () => {
  for (let i = 0; i < 3; i++) {
    await postJson("/api/recents", { modelName: `model-${i}` });
  }
  const r = await t.fetch("/api/recents");
  const body = (await r.json()) as { models: string[] };
  expect(body.models.length).toBe(3);
  for (let i = 0; i < 3; i++) expect(body.models).toContain(`model-${i}`);
});
