import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db";
import { runMigrations } from "../src/db/migrations";
import { createTask } from "../src/db/tasks";
import {
  createMatrixRun,
  createRun,
  getMatrixRun,
  getRun,
  listRunsForMatrix,
} from "../src/db/runs";
import { runMatrix } from "../src/orchestrator/runMatrix";

function setup() {
  const runsRoot = mkdtempSync(join(tmpdir(), "b3-matrix-"));
  const db = openDb(":memory:");
  runMigrations(db);
  const taskId = createTask(db, {
    name: "t",
    prompt: "p",
    baseRepo: null,
    baseCommit: null,
    testCommand: null,
    timeBudgetS: 60,
    judgeEnabled: false,
  });
  return {
    db,
    runsRoot,
    taskId,
    cleanup: () => {
      db.close();
      rmSync(runsRoot, { recursive: true, force: true });
    },
  };
}

test("4 combos with concurrency=2: never more than 2 running at any time", async () => {
  const { db, runsRoot, taskId, cleanup } = setup();
  try {
    const matrixId = createMatrixRun(db, {
      taskId,
      skillIds: [],
      concurrency: 2,
    });
    const cellRunIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      cellRunIds.push(
        createRun(db, {
          matrixRunId: matrixId,
          harness: "claude_code",
          providerId: `p-${i}`,
          modelId: "m",
          worktreePath: "",
        }),
      );
    }
    let active = 0;
    let peak = 0;
    const runOneFn = async (input: { runId: string }) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 80));
      // simulate marking passed by writing into runs table directly
      db.run(
        "UPDATE runs SET status='passed', completed_at = ? WHERE id = ?",
        [new Date().toISOString(), input.runId],
      );
      active--;
    };
    const m = runMatrix({
      db,
      matrixRunId: matrixId,
      runIds: cellRunIds,
      concurrency: 2,
      runOneFn,
    });
    await m.done;
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(0);
    expect(getMatrixRun(db, matrixId)?.status).toBe("completed");
    for (const rid of cellRunIds) {
      expect(getRun(db, rid)?.status).toBe("passed");
    }
  } finally {
    cleanup();
  }
});

test("concurrency=1: strictly sequential (peak active = 1)", async () => {
  const { db, runsRoot, taskId, cleanup } = setup();
  try {
    const matrixId = createMatrixRun(db, {
      taskId,
      skillIds: [],
      concurrency: 1,
    });
    const cellRunIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      cellRunIds.push(
        createRun(db, {
          matrixRunId: matrixId,
          harness: "claude_code",
          providerId: `p-${i}`,
          modelId: "m",
          worktreePath: "",
        }),
      );
    }
    let active = 0;
    let peak = 0;
    const m = runMatrix({
      db,
      matrixRunId: matrixId,
      runIds: cellRunIds,
      concurrency: 1,
      runOneFn: async ({ runId }) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 30));
        db.run(
          "UPDATE runs SET status='passed', completed_at = ? WHERE id = ?",
          [new Date().toISOString(), runId],
        );
        active--;
      },
    });
    await m.done;
    expect(peak).toBe(1);
  } finally {
    cleanup();
  }
});

test("cancellation kills running children and marks them canceled", async () => {
  const { db, taskId, cleanup } = setup();
  try {
    const matrixId = createMatrixRun(db, {
      taskId,
      skillIds: [],
      concurrency: 2,
    });
    const cellRunIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      cellRunIds.push(
        createRun(db, {
          matrixRunId: matrixId,
          harness: "claude_code",
          providerId: `p-${i}`,
          modelId: "m",
          worktreePath: "",
        }),
      );
    }

    const matrix = runMatrix({
      db,
      matrixRunId: matrixId,
      runIds: cellRunIds,
      concurrency: 2,
      runOneFn: async ({ runId, signal }) => {
        try {
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, 5000);
            signal?.addEventListener(
              "abort",
              () => {
                clearTimeout(t);
                reject(new Error("aborted"));
              },
              { once: true },
            );
          });
          db.run(
            "UPDATE runs SET status='passed', completed_at = ? WHERE id = ?",
            [new Date().toISOString(), runId],
          );
        } catch {
          db.run(
            "UPDATE runs SET status='canceled', completed_at = ? WHERE id = ?",
            [new Date().toISOString(), runId],
          );
        }
      },
    });
    await new Promise((r) => setTimeout(r, 100));
    matrix.cancel();
    await matrix.done;
    const m = getMatrixRun(db, matrixId)!;
    expect(m.status).toBe("canceled");
    const runs = listRunsForMatrix(db, matrixId);
    const canceled = runs.filter((r) => r.status === "canceled");
    expect(canceled.length).toBeGreaterThan(0);
  } finally {
    cleanup();
  }
});
