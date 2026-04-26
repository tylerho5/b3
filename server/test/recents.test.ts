import { test, expect, beforeEach } from "bun:test";
import { openDb } from "../src/db";
import { runMigrations } from "../src/db/migrations";
import { addRecent, listRecent } from "../src/db/recents";

let db: ReturnType<typeof openDb>;
beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
});

test("addRecent + listRecent round-trips", () => {
  addRecent(db, "claude-sonnet-4-6");
  const list = listRecent(db);
  expect(list).toContain("claude-sonnet-4-6");
});

test("addRecent upserts — same model twice produces one row", () => {
  addRecent(db, "claude-opus-4-7");
  addRecent(db, "claude-opus-4-7");
  const list = listRecent(db);
  expect(list.filter((m) => m === "claude-opus-4-7").length).toBe(1);
});

test("addRecent updates last_used_at on repeat", () => {
  addRecent(db, "gpt-5.4", 1000);
  addRecent(db, "qwen3-coder", 2000);
  addRecent(db, "gpt-5.4", 3000);
  // gpt-5.4 was used last, should be first
  const list = listRecent(db);
  expect(list[0]).toBe("gpt-5.4");
});

test("listRecent returns most-recent first", () => {
  addRecent(db, "model-a", 1000);
  addRecent(db, "model-b", 2000);
  addRecent(db, "model-c", 3000);
  const list = listRecent(db);
  expect(list[0]).toBe("model-c");
  expect(list[1]).toBe("model-b");
  expect(list[2]).toBe("model-a");
});

test("listRecent respects limit", () => {
  for (let i = 0; i < 15; i++) addRecent(db, `model-${i}`, i * 1000);
  const list = listRecent(db, 5);
  expect(list.length).toBe(5);
});

test("listRecent default limit is 10", () => {
  for (let i = 0; i < 15; i++) addRecent(db, `model-${i}`, i * 1000);
  const list = listRecent(db);
  expect(list.length).toBe(10);
});
