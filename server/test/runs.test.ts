import { test, expect, beforeEach } from "bun:test";
import { openDb } from "../src/db";
import { runMigrations } from "../src/db/migrations";
import { createTask } from "../src/db/tasks";
import {
  createMatrixRun,
  createRun,
  updateRunStatus,
  incrementRunUsage,
  getMatrixRunWithCells,
} from "../src/db/runs";
import { createSegment, closeSegment } from "../src/db/segments";
import { appendEvent, listEvents } from "../src/db/events";

let db: ReturnType<typeof openDb>;
let taskId: string;

beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
  taskId = createTask(db, {
    name: "t",
    prompt: "p",
    baseRepo: null,
    baseCommit: null,
    testCommand: null,
    timeBudgetS: 600,
    judgeEnabled: false,
  });
});

test("createMatrixRun returns id and inserts row", () => {
  const id = createMatrixRun(db, {
    taskId,
    skillIds: ["plugin:foo"],
    concurrency: 4,
  });
  expect(id).toBeTruthy();
  const row = db
    .query("SELECT * FROM matrix_runs WHERE id = ?")
    .get(id) as { task_id: string; status: string; concurrency: number };
  expect(row.task_id).toBe(taskId);
  expect(row.status).toBe("running");
  expect(row.concurrency).toBe(4);
});

test("createRun is linked to a matrix_run", () => {
  const matrixId = createMatrixRun(db, {
    taskId,
    skillIds: [],
    concurrency: 1,
  });
  const runId = createRun(db, {
    matrixRunId: matrixId,
    harness: "claude_code",
    providerId: "anthropic-direct",
    modelId: "claude-haiku-4-5",
    worktreePath: "/tmp/x",
  });
  const row = db.query("SELECT * FROM runs WHERE id = ?").get(runId) as {
    matrix_run_id: string;
    status: string;
  };
  expect(row.matrix_run_id).toBe(matrixId);
  expect(row.status).toBe("pending");
});

test("appendEvent persists payload and is queryable in order", () => {
  const matrixId = createMatrixRun(db, {
    taskId,
    skillIds: [],
    concurrency: 1,
  });
  const runId = createRun(db, {
    matrixRunId: matrixId,
    harness: "claude_code",
    providerId: "p",
    modelId: "m",
    worktreePath: "/tmp/x",
  });
  appendEvent(db, runId, 0, 1000, "session_init", { sessionId: "s1" });
  appendEvent(db, runId, 0, 1100, "assistant_text", { textDelta: "hi" });
  appendEvent(db, runId, 0, 1050, "tool_call", { toolName: "Read" });
  const events = listEvents(db, runId);
  expect(events).toHaveLength(3);
  expect(events.map((e) => e.tsMs)).toEqual([1000, 1050, 1100]);
  expect(events[0].payload).toEqual({ sessionId: "s1" });
});

test("updateRunStatus transitions correctly", () => {
  const matrixId = createMatrixRun(db, {
    taskId,
    skillIds: [],
    concurrency: 1,
  });
  const runId = createRun(db, {
    matrixRunId: matrixId,
    harness: "claude_code",
    providerId: "p",
    modelId: "m",
    worktreePath: "/tmp/x",
  });
  updateRunStatus(db, runId, "running");
  const row = db.query("SELECT status, started_at FROM runs WHERE id = ?").get(
    runId,
  ) as { status: string; started_at: string | null };
  expect(row.status).toBe("running");
  expect(row.started_at).not.toBeNull();
});

test("incrementRunUsage adds tokens and cost atomically", () => {
  const matrixId = createMatrixRun(db, {
    taskId,
    skillIds: [],
    concurrency: 1,
  });
  const runId = createRun(db, {
    matrixRunId: matrixId,
    harness: "claude_code",
    providerId: "p",
    modelId: "m",
    worktreePath: "/tmp/x",
  });
  for (let i = 0; i < 3; i++) {
    incrementRunUsage(db, runId, {
      input: 100,
      output: 50,
      cacheRead: 10,
      cacheWrite: 5,
      costUsd: 0.01,
    });
  }
  const row = db
    .query(
      "SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd FROM runs WHERE id = ?",
    )
    .get(runId) as {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    cost_usd: number;
  };
  expect(row.input_tokens).toBe(300);
  expect(row.output_tokens).toBe(150);
  expect(row.cache_read_tokens).toBe(30);
  expect(row.cache_write_tokens).toBe(15);
  expect(row.cost_usd).toBeCloseTo(0.03, 5);
});

test("createSegment + closeSegment populate completed_at, duration_ms, totals", async () => {
  const matrixId = createMatrixRun(db, {
    taskId,
    skillIds: [],
    concurrency: 1,
  });
  const runId = createRun(db, {
    matrixRunId: matrixId,
    harness: "claude_code",
    providerId: "p",
    modelId: "m",
    worktreePath: "/tmp/x",
  });
  createSegment(db, runId, 0, "initial", null);
  await new Promise((r) => setTimeout(r, 5));
  closeSegment(db, runId, 0, {
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.005,
  });
  const row = db
    .query(
      "SELECT completed_at, duration_ms, input_tokens, output_tokens, cost_usd FROM run_segments WHERE run_id = ? AND seq = ?",
    )
    .get(runId, 0) as {
    completed_at: string | null;
    duration_ms: number | null;
    input_tokens: number | null;
    output_tokens: number | null;
    cost_usd: number | null;
  };
  expect(row.completed_at).not.toBeNull();
  expect(row.duration_ms).toBeGreaterThanOrEqual(0);
  expect(row.input_tokens).toBe(100);
  expect(row.output_tokens).toBe(50);
  expect(row.cost_usd).toBeCloseTo(0.005, 5);
});

test("getMatrixRunWithCells returns matrix_run + child runs", () => {
  const matrixId = createMatrixRun(db, {
    taskId,
    skillIds: ["plugin:foo"],
    concurrency: 2,
  });
  createRun(db, {
    matrixRunId: matrixId,
    harness: "claude_code",
    providerId: "p1",
    modelId: "m1",
    worktreePath: "/tmp/a",
  });
  createRun(db, {
    matrixRunId: matrixId,
    harness: "codex",
    providerId: "p2",
    modelId: "m2",
    worktreePath: "/tmp/b",
  });
  const result = getMatrixRunWithCells(db, matrixId);
  expect(result).not.toBeNull();
  expect(result!.matrixRun.id).toBe(matrixId);
  expect(result!.matrixRun.skillIds).toEqual(["plugin:foo"]);
  expect(result!.cells).toHaveLength(2);
});
