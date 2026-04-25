import type { DB } from "./index";

export type SegmentKind = "initial" | "followup" | "broadcast";

export interface RunSegment {
  id: number;
  runId: string;
  seq: number;
  kind: SegmentKind;
  message: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

interface SegmentRow {
  id: number;
  run_id: string;
  seq: number;
  kind: SegmentKind;
  message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
}

function rowToSegment(r: SegmentRow): RunSegment {
  return {
    id: r.id,
    runId: r.run_id,
    seq: r.seq,
    kind: r.kind,
    message: r.message,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    durationMs: r.duration_ms,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    costUsd: r.cost_usd,
  };
}

export function createSegment(
  db: DB,
  runId: string,
  seq: number,
  kind: SegmentKind,
  message: string | null,
): void {
  db.run(
    `INSERT INTO run_segments (run_id, seq, kind, message, started_at)
     VALUES (?, ?, ?, ?, ?)`,
    [runId, seq, kind, message, new Date().toISOString()],
  );
}

export function closeSegment(
  db: DB,
  runId: string,
  seq: number,
  totals: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    costUsd?: number | null;
  },
): void {
  db.transaction(() => {
    const cur = db
      .query(
        "SELECT started_at FROM run_segments WHERE run_id = ? AND seq = ?",
      )
      .get(runId, seq) as { started_at: string } | undefined;
    if (!cur) return;
    const startedMs = new Date(cur.started_at).getTime();
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedMs;
    db.run(
      `UPDATE run_segments SET
         completed_at  = ?,
         duration_ms   = ?,
         input_tokens  = ?,
         output_tokens = ?,
         cost_usd      = ?
       WHERE run_id = ? AND seq = ?`,
      [
        completedAt,
        durationMs,
        totals.inputTokens ?? null,
        totals.outputTokens ?? null,
        totals.costUsd ?? null,
        runId,
        seq,
      ],
    );
  })();
}

export function listSegments(db: DB, runId: string): RunSegment[] {
  const rows = db
    .query("SELECT * FROM run_segments WHERE run_id = ? ORDER BY seq")
    .all(runId) as SegmentRow[];
  return rows.map(rowToSegment);
}
