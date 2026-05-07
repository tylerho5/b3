import { test, expect, beforeEach } from "bun:test";
import { openDb } from "../src/db";
import { runMigrations } from "../src/db/migrations";
import { setPin, getPin, listPins, deletePin } from "../src/db/routePins";

let db: ReturnType<typeof openDb>;
beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
});

test("setPin + getPin round-trips per harness", () => {
  setPin(db, "claude-sonnet-4-6", "claude_code", "provider-abc");
  expect(getPin(db, "claude-sonnet-4-6", "claude_code")).toBe("provider-abc");
});

test("getPin returns null when no pin exists", () => {
  expect(getPin(db, "nonexistent-model", "claude_code")).toBeNull();
});

test("getPin returns null for existing model but different harness", () => {
  setPin(db, "glm-5", "claude_code", "route-1");
  expect(getPin(db, "glm-5", "codex")).toBeNull();
});

test("setPin upserts per (model, harness) — same harness replaces, different harness is independent", () => {
  setPin(db, "glm-5", "claude_code", "route-1");
  setPin(db, "glm-5", "claude_code", "route-2");
  setPin(db, "glm-5", "codex", "route-x");
  expect(getPin(db, "glm-5", "claude_code")).toBe("route-2");
  expect(getPin(db, "glm-5", "codex")).toBe("route-x");
});

test("listPins returns nested record keyed by model then harness", () => {
  setPin(db, "model-a", "claude_code", "route-x");
  setPin(db, "model-a", "codex", "route-y");
  setPin(db, "model-b", "claude_code", "route-z");
  const pins = listPins(db);
  expect(pins).toEqual({
    "model-a": { claude_code: "route-x", codex: "route-y" },
    "model-b": { claude_code: "route-z" },
  });
});

test("listPins returns empty object when no pins", () => {
  expect(listPins(db)).toEqual({});
});

test("deletePin removes the (model, harness) pin", () => {
  setPin(db, "claude-opus-4-7", "claude_code", "route-z");
  deletePin(db, "claude-opus-4-7", "claude_code");
  expect(getPin(db, "claude-opus-4-7", "claude_code")).toBeNull();
});

test("deletePin only removes the specified harness pin", () => {
  setPin(db, "model-x", "claude_code", "r1");
  setPin(db, "model-x", "codex", "r2");
  deletePin(db, "model-x", "claude_code");
  expect(getPin(db, "model-x", "claude_code")).toBeNull();
  expect(getPin(db, "model-x", "codex")).toBe("r2");
});

test("deletePin is idempotent — deleting nonexistent pin is a no-op", () => {
  expect(() => deletePin(db, "does-not-exist", "claude_code")).not.toThrow();
});
