import { test, expect, beforeEach } from "bun:test";
import { openDb } from "../src/db";
import { runMigrations } from "../src/db/migrations";
import { setPin, getPin, listPins, deletePin } from "../src/db/routePins";

let db: ReturnType<typeof openDb>;
beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
});

test("setPin + getPin round-trips", () => {
  setPin(db, "claude-sonnet-4-6", "provider-abc");
  expect(getPin(db, "claude-sonnet-4-6")).toBe("provider-abc");
});

test("getPin returns null when no pin exists", () => {
  expect(getPin(db, "nonexistent-model")).toBeNull();
});

test("setPin upserts — second call replaces the route", () => {
  setPin(db, "glm-5", "route-1");
  setPin(db, "glm-5", "route-2");
  expect(getPin(db, "glm-5")).toBe("route-2");
});

test("listPins returns all pins as a record", () => {
  setPin(db, "model-a", "route-x");
  setPin(db, "model-b", "route-y");
  const pins = listPins(db);
  expect(pins["model-a"]).toBe("route-x");
  expect(pins["model-b"]).toBe("route-y");
});

test("deletePin removes the pin", () => {
  setPin(db, "claude-opus-4-7", "route-z");
  deletePin(db, "claude-opus-4-7");
  expect(getPin(db, "claude-opus-4-7")).toBeNull();
});

test("deletePin is idempotent — deleting nonexistent pin is a no-op", () => {
  expect(() => deletePin(db, "does-not-exist")).not.toThrow();
});
