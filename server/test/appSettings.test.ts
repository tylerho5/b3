import { test, expect, beforeEach } from "bun:test";
import { openDb, type DB } from "../src/db";
import { runMigrations } from "../src/db/migrations";
import { getSetting, putSetting } from "../src/db/appSettings";

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
});

test("getSetting returns null for missing key", () => {
  expect(getSetting(db, "missing")).toBeNull();
});

test("putSetting + getSetting round-trip", () => {
  putSetting(db, "judge_template", "hello {task_name}");
  expect(getSetting(db, "judge_template")).toBe("hello {task_name}");
});

test("putSetting overwrites existing value", () => {
  putSetting(db, "x", "a");
  putSetting(db, "x", "b");
  expect(getSetting(db, "x")).toBe("b");
});
