import { test, expect, beforeEach, afterEach } from "bun:test";
import { createTestApp, type TestApp } from "./_helpers";
import { putSetting } from "../src/db/appSettings";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
});
afterEach(() => {
  t.cleanup();
});

test("GET /api/settings/judge returns null template when unset", async () => {
  const r = await t.fetch("/api/settings/judge");
  expect(r.status).toBe(200);
  const body = (await r.json()) as { template: string | null };
  expect(body.template).toBeNull();
});

test("GET /api/settings/judge returns the stored template", async () => {
  putSetting(t.app.db, "judge_template", "score it");
  const r = await t.fetch("/api/settings/judge");
  const body = (await r.json()) as { template: string };
  expect(body.template).toBe("score it");
});

test("PUT /api/settings/judge stores the template", async () => {
  const r = await t.fetch("/api/settings/judge", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ template: "new template" }),
  });
  expect(r.status).toBe(200);
  const get = await t.fetch("/api/settings/judge");
  const body = (await get.json()) as { template: string };
  expect(body.template).toBe("new template");
});

test("PUT /api/settings/judge requires template field", async () => {
  const r = await t.fetch("/api/settings/judge", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  expect(r.status).toBe(400);
});
