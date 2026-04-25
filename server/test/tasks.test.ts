import { test, expect, beforeEach } from "bun:test";
import { openDb } from "../src/db";
import { runMigrations } from "../src/db/migrations";
import {
  createTask,
  getTask,
  listTasks,
  updateTask,
  deleteTask,
} from "../src/db/tasks";

let db: ReturnType<typeof openDb>;
beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
});

test("createTask + getTask round-trips", () => {
  const id = createTask(db, {
    name: "fix bug",
    prompt: "fix it",
    baseRepo: null,
    baseCommit: null,
    testCommand: "pytest",
    timeBudgetS: 600,
    judgeEnabled: true,
  });
  const t = getTask(db, id);
  expect(t?.name).toBe("fix bug");
  expect(t?.judgeEnabled).toBe(true);
  expect(t?.testCommand).toBe("pytest");
  expect(t?.id).toBe(id);
});

test("listTasks returns all", () => {
  createTask(db, {
    name: "a",
    prompt: "a",
    baseRepo: null,
    baseCommit: null,
    testCommand: null,
    timeBudgetS: 600,
    judgeEnabled: false,
  });
  createTask(db, {
    name: "b",
    prompt: "b",
    baseRepo: null,
    baseCommit: null,
    testCommand: null,
    timeBudgetS: 600,
    judgeEnabled: false,
  });
  expect(listTasks(db)).toHaveLength(2);
});

test("updateTask persists changes", () => {
  const id = createTask(db, {
    name: "old",
    prompt: "p",
    baseRepo: null,
    baseCommit: null,
    testCommand: null,
    timeBudgetS: 600,
    judgeEnabled: false,
  });
  updateTask(db, id, { name: "new" });
  expect(getTask(db, id)?.name).toBe("new");
});

test("deleteTask removes row", () => {
  const id = createTask(db, {
    name: "x",
    prompt: "p",
    baseRepo: null,
    baseCommit: null,
    testCommand: null,
    timeBudgetS: 600,
    judgeEnabled: false,
  });
  deleteTask(db, id);
  expect(getTask(db, id)).toBeNull();
});
