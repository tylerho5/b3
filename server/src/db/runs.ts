import { ulid } from "ulid";
import type { DB } from "./index";

export type RunStatus =
  | "pending"
  | "running"
  | "testing"
  | "passed"
  | "failed"
  | "error"
  | "canceled";

export type MatrixRunStatus = "running" | "completed" | "canceled";

export interface MatrixRun {
  id: string;
  taskId: string;
  skillIds: string[];
  concurrency: number;
  startedAt: string;
  completedAt: string | null;
  status: MatrixRunStatus;
}

export interface Run {
  id: string;
  matrixRunId: string;
  harness: string;
  providerId: string;
  modelId: string;
  worktreePath: string;
  sessionId: string | null;
  status: RunStatus;
  startedAt: string | null;
  completedAt: string | null;
  exitCode: number | null;
  testsPassed: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  turns: number;
  judgeScore: number | null;
  judgeNotes: string | null;
}

interface MatrixRunRow {
  id: string;
  task_id: string;
  skill_ids: string;
  concurrency: number;
  started_at: string;
  completed_at: string | null;
  status: MatrixRunStatus;
}

interface RunRow {
  id: string;
  matrix_run_id: string;
  harness: string;
  provider_id: string;
  model_id: string;
  worktree_path: string;
  session_id: string | null;
  status: RunStatus;
  started_at: string | null;
  completed_at: string | null;
  exit_code: number | null;
  tests_passed: number | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  turns: number;
  judge_score: number | null;
  judge_notes: string | null;
}

function rowToMatrixRun(r: MatrixRunRow): MatrixRun {
  return {
    id: r.id,
    taskId: r.task_id,
    skillIds: JSON.parse(r.skill_ids) as string[],
    concurrency: r.concurrency,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    status: r.status,
  };
}

function rowToRun(r: RunRow): Run {
  return {
    id: r.id,
    matrixRunId: r.matrix_run_id,
    harness: r.harness,
    providerId: r.provider_id,
    modelId: r.model_id,
    worktreePath: r.worktree_path,
    sessionId: r.session_id,
    status: r.status,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    exitCode: r.exit_code,
    testsPassed: r.tests_passed,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    cacheReadTokens: r.cache_read_tokens,
    cacheWriteTokens: r.cache_write_tokens,
    costUsd: r.cost_usd,
    turns: r.turns,
    judgeScore: r.judge_score,
    judgeNotes: r.judge_notes,
  };
}

export function createMatrixRun(
  db: DB,
  input: { taskId: string; skillIds: string[]; concurrency: number },
): string {
  const id = ulid();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO matrix_runs (id, task_id, skill_ids, concurrency, started_at, status)
     VALUES (?, ?, ?, ?, ?, 'running')`,
    [
      id,
      input.taskId,
      JSON.stringify(input.skillIds),
      input.concurrency,
      now,
    ],
  );
  return id;
}

export function getMatrixRun(db: DB, id: string): MatrixRun | null {
  const row = db.query("SELECT * FROM matrix_runs WHERE id = ?").get(id) as
    | MatrixRunRow
    | undefined;
  return row ? rowToMatrixRun(row) : null;
}

export function listMatrixRuns(db: DB): MatrixRun[] {
  const rows = db
    .query("SELECT * FROM matrix_runs ORDER BY started_at DESC")
    .all() as MatrixRunRow[];
  return rows.map(rowToMatrixRun);
}

export function updateMatrixRunStatus(
  db: DB,
  id: string,
  status: MatrixRunStatus,
): void {
  if (status === "completed" || status === "canceled") {
    db.run(
      "UPDATE matrix_runs SET status = ?, completed_at = ? WHERE id = ?",
      [status, new Date().toISOString(), id],
    );
  } else {
    db.run("UPDATE matrix_runs SET status = ? WHERE id = ?", [status, id]);
  }
}

export function createRun(
  db: DB,
  input: {
    matrixRunId: string;
    harness: string;
    providerId: string;
    modelId: string;
    worktreePath: string;
  },
): string {
  const id = ulid();
  db.run(
    `INSERT INTO runs (id, matrix_run_id, harness, provider_id, model_id, worktree_path, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [
      id,
      input.matrixRunId,
      input.harness,
      input.providerId,
      input.modelId,
      input.worktreePath,
    ],
  );
  return id;
}

export function getRun(db: DB, id: string): Run | null {
  const row = db.query("SELECT * FROM runs WHERE id = ?").get(id) as
    | RunRow
    | undefined;
  return row ? rowToRun(row) : null;
}

export function listRunsForMatrix(db: DB, matrixRunId: string): Run[] {
  const rows = db
    .query("SELECT * FROM runs WHERE matrix_run_id = ? ORDER BY id")
    .all(matrixRunId) as RunRow[];
  return rows.map(rowToRun);
}

export function updateRunStatus(db: DB, id: string, status: RunStatus): void {
  const now = new Date().toISOString();
  if (status === "running" || status === "testing") {
    db.run(
      "UPDATE runs SET status = ?, started_at = COALESCE(started_at, ?) WHERE id = ?",
      [status, now, id],
    );
  } else if (
    status === "passed" ||
    status === "failed" ||
    status === "error" ||
    status === "canceled"
  ) {
    db.run(
      "UPDATE runs SET status = ?, completed_at = ? WHERE id = ?",
      [status, now, id],
    );
  } else {
    db.run("UPDATE runs SET status = ? WHERE id = ?", [status, id]);
  }
}

export function setRunSessionId(db: DB, id: string, sessionId: string): void {
  db.run("UPDATE runs SET session_id = ? WHERE id = ?", [sessionId, id]);
}

export function setRunTestResult(
  db: DB,
  id: string,
  testsPassed: boolean,
): void {
  db.run("UPDATE runs SET tests_passed = ? WHERE id = ?", [
    testsPassed ? 1 : 0,
    id,
  ]);
}

export function incrementRunUsage(
  db: DB,
  id: string,
  delta: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    costUsd?: number;
  },
): void {
  db.transaction(() => {
    db.run(
      `UPDATE runs SET
         input_tokens       = input_tokens       + ?,
         output_tokens      = output_tokens      + ?,
         cache_read_tokens  = cache_read_tokens  + ?,
         cache_write_tokens = cache_write_tokens + ?,
         cost_usd           = cost_usd           + ?
       WHERE id = ?`,
      [
        delta.input,
        delta.output,
        delta.cacheRead,
        delta.cacheWrite,
        delta.costUsd ?? 0,
        id,
      ],
    );
  })();
}

export function incrementRunTurns(db: DB, id: string, by = 1): void {
  db.run("UPDATE runs SET turns = turns + ? WHERE id = ?", [by, id]);
}

export function getMatrixRunWithCells(
  db: DB,
  id: string,
): { matrixRun: MatrixRun; cells: Run[] } | null {
  const m = getMatrixRun(db, id);
  if (!m) return null;
  return { matrixRun: m, cells: listRunsForMatrix(db, id) };
}
