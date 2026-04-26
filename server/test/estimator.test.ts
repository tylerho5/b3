import { test, expect, beforeEach } from "bun:test";
import { openDb, type DB } from "../src/db";
import { runMigrations } from "../src/db/migrations";
import { createTask } from "../src/db/tasks";
import { createMatrixRun, createRun } from "../src/db/runs";
import { estimateMatrix } from "../src/estimator";

let db: DB;
let taskId: string;
let matrixRunId: string;

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
  matrixRunId = createMatrixRun(db, {
    taskId,
    skillIds: [],
    concurrency: 4,
  });
});

interface SeedRun {
  harness: string;
  providerId: string;
  modelId: string;
  durationMs: number;
  status?: string;
}

function seedRun(r: SeedRun): string {
  const id = createRun(db, {
    matrixRunId,
    harness: r.harness,
    providerId: r.providerId,
    modelId: r.modelId,
    worktreePath: "/tmp/x",
  });
  const start = new Date("2026-04-01T00:00:00Z");
  const end = new Date(start.getTime() + r.durationMs);
  db.run(
    "UPDATE runs SET started_at = ?, completed_at = ?, status = ? WHERE id = ?",
    [start.toISOString(), end.toISOString(), r.status ?? "passed", id],
  );
  return id;
}

test("returns 0/0 when no runs match", () => {
  const out = estimateMatrix(db, [
    { harness: "claude_code", providerId: "p1", modelId: "m1" },
  ]);
  expect(out.cellsWithHistory).toBe(0);
  expect(out.medianMs).toBe(0);
});

test("median of single matching run is its duration", () => {
  seedRun({
    harness: "claude_code",
    providerId: "p1",
    modelId: "m1",
    durationMs: 30_000,
  });
  const out = estimateMatrix(db, [
    { harness: "claude_code", providerId: "p1", modelId: "m1" },
  ]);
  expect(out.cellsWithHistory).toBe(1);
  expect(out.medianMs).toBe(30_000);
});

test("median across multiple matching runs (odd count)", () => {
  seedRun({ harness: "claude_code", providerId: "p1", modelId: "m1", durationMs: 10_000 });
  seedRun({ harness: "claude_code", providerId: "p1", modelId: "m1", durationMs: 30_000 });
  seedRun({ harness: "claude_code", providerId: "p1", modelId: "m1", durationMs: 50_000 });
  const out = estimateMatrix(db, [
    { harness: "claude_code", providerId: "p1", modelId: "m1" },
  ]);
  expect(out.cellsWithHistory).toBe(1);
  expect(out.medianMs).toBe(30_000);
});

test("median is mean of two middle values for even count", () => {
  seedRun({ harness: "claude_code", providerId: "p1", modelId: "m1", durationMs: 10_000 });
  seedRun({ harness: "claude_code", providerId: "p1", modelId: "m1", durationMs: 20_000 });
  seedRun({ harness: "claude_code", providerId: "p1", modelId: "m1", durationMs: 30_000 });
  seedRun({ harness: "claude_code", providerId: "p1", modelId: "m1", durationMs: 40_000 });
  const out = estimateMatrix(db, [
    { harness: "claude_code", providerId: "p1", modelId: "m1" },
  ]);
  expect(out.medianMs).toBe(25_000);
});

test("counts only triples with at least one matching run", () => {
  seedRun({ harness: "claude_code", providerId: "p1", modelId: "m1", durationMs: 30_000 });
  // p2/m2 has no history
  const out = estimateMatrix(db, [
    { harness: "claude_code", providerId: "p1", modelId: "m1" },
    { harness: "claude_code", providerId: "p2", modelId: "m2" },
  ]);
  expect(out.cellsWithHistory).toBe(1);
  expect(out.medianMs).toBe(30_000);
});

test("median pools durations from all matching triples", () => {
  seedRun({ harness: "claude_code", providerId: "p1", modelId: "m1", durationMs: 10_000 });
  seedRun({ harness: "codex", providerId: "p2", modelId: "m2", durationMs: 50_000 });
  const out = estimateMatrix(db, [
    { harness: "claude_code", providerId: "p1", modelId: "m1" },
    { harness: "codex", providerId: "p2", modelId: "m2" },
  ]);
  expect(out.cellsWithHistory).toBe(2);
  expect(out.medianMs).toBe(30_000);
});

test("ignores runs that did not complete", () => {
  // started_at set, completed_at null — running/canceled mid-flight
  const id = createRun(db, {
    matrixRunId,
    harness: "claude_code",
    providerId: "p1",
    modelId: "m1",
    worktreePath: "/tmp/x",
  });
  db.run(
    "UPDATE runs SET started_at = ?, status = 'running' WHERE id = ?",
    [new Date().toISOString(), id],
  );
  const out = estimateMatrix(db, [
    { harness: "claude_code", providerId: "p1", modelId: "m1" },
  ]);
  expect(out.cellsWithHistory).toBe(0);
});

test("ignores canceled runs", () => {
  seedRun({
    harness: "claude_code",
    providerId: "p1",
    modelId: "m1",
    durationMs: 30_000,
    status: "canceled",
  });
  const out = estimateMatrix(db, [
    { harness: "claude_code", providerId: "p1", modelId: "m1" },
  ]);
  expect(out.cellsWithHistory).toBe(0);
});

test("empty input returns empty result", () => {
  const out = estimateMatrix(db, []);
  expect(out.cellsWithHistory).toBe(0);
  expect(out.medianMs).toBe(0);
});

test("does not double-count when triple appears twice in input", () => {
  seedRun({ harness: "claude_code", providerId: "p1", modelId: "m1", durationMs: 30_000 });
  const out = estimateMatrix(db, [
    { harness: "claude_code", providerId: "p1", modelId: "m1" },
    { harness: "claude_code", providerId: "p1", modelId: "m1" },
  ]);
  expect(out.cellsWithHistory).toBe(1);
});
