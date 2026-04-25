import type { DB } from "../db";
import { listRunsForMatrix, updateMatrixRunStatus } from "../db/runs";

export interface RunOneFnInput {
  runId: string;
  signal?: AbortSignal;
}

export interface RunMatrixInput {
  db: DB;
  matrixRunId: string;
  runIds: string[];
  concurrency: number;
  runOneFn: (input: RunOneFnInput) => Promise<void>;
}

export interface MatrixHandle {
  done: Promise<void>;
  cancel: () => void;
}

export function runMatrix(input: RunMatrixInput): MatrixHandle {
  const { db, matrixRunId, runIds, concurrency, runOneFn } = input;
  const controller = new AbortController();

  const queue = [...runIds];
  const inFlight = new Set<Promise<void>>();
  let canceled = false;

  const startNext = async (): Promise<void> => {
    if (canceled) return;
    const id = queue.shift();
    if (!id) return;
    const p = (async () => {
      try {
        await runOneFn({ runId: id, signal: controller.signal });
      } catch {
        // runOneFn is responsible for marking errored runs in the DB.
      }
    })();
    inFlight.add(p);
    try {
      await p;
    } finally {
      inFlight.delete(p);
    }
    if (!canceled) await startNext();
  };

  const done = (async () => {
    const initial = Math.min(concurrency, queue.length);
    const workers: Promise<void>[] = [];
    for (let i = 0; i < initial; i++) workers.push(startNext());
    await Promise.all(workers);
    await Promise.all(inFlight);
    if (canceled) {
      updateMatrixRunStatus(db, matrixRunId, "canceled");
    } else {
      // Determine final matrix status based on cells:
      const cells = listRunsForMatrix(db, matrixRunId);
      const hasError = cells.some((c) => c.status === "error");
      updateMatrixRunStatus(
        db,
        matrixRunId,
        hasError ? "completed" : "completed",
      );
    }
  })();

  return {
    done,
    cancel: () => {
      canceled = true;
      controller.abort();
    },
  };
}

export async function awaitMatrix(handle: MatrixHandle): Promise<void> {
  await handle.done;
}
