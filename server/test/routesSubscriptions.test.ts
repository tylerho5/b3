import { test, expect } from "bun:test";
import { createTestApp } from "./_helpers";

test("GET /api/subscriptions/status?harness=claude_code returns shape", async () => {
  const t = createTestApp();
  try {
    const r = await t.fetch("/api/subscriptions/status?harness=claude_code");
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(typeof body.installed).toBe("boolean");
    expect(typeof body.authenticated).toBe("boolean");
  } finally {
    t.cleanup();
  }
});

test("GET /api/subscriptions/status?harness=codex returns shape", async () => {
  const t = createTestApp();
  try {
    const r = await t.fetch("/api/subscriptions/status?harness=codex");
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(typeof body.installed).toBe("boolean");
    expect(typeof body.authenticated).toBe("boolean");
  } finally {
    t.cleanup();
  }
});

test("GET /api/subscriptions/status rejects unknown harness", async () => {
  const t = createTestApp();
  try {
    const r = await t.fetch("/api/subscriptions/status?harness=nope");
    expect(r.status).toBe(400);
  } finally {
    t.cleanup();
  }
});

test("GET /api/subscriptions/status rejects missing harness", async () => {
  const t = createTestApp();
  try {
    const r = await t.fetch("/api/subscriptions/status");
    expect(r.status).toBe(400);
  } finally {
    t.cleanup();
  }
});
