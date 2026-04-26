import type { DB } from "./db";

export interface EstimatorTriple {
  harness: string;
  providerId: string;
  modelId: string;
}

export interface EstimatorResult {
  cellsWithHistory: number;
  medianMs: number;
}

interface DurationRow {
  started_at: string;
  completed_at: string;
}

export function estimateMatrix(
  db: DB,
  triples: EstimatorTriple[],
): EstimatorResult {
  const seen = new Set<string>();
  const dedup: EstimatorTriple[] = [];
  for (const t of triples) {
    const key = `${t.harness}::${t.providerId}::${t.modelId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(t);
  }

  const allDurations: number[] = [];
  let cellsWithHistory = 0;

  const stmt = db.query<DurationRow, [string, string, string]>(
    `SELECT started_at, completed_at FROM runs
     WHERE harness = ? AND provider_id = ? AND model_id = ?
       AND started_at IS NOT NULL
       AND completed_at IS NOT NULL
       AND status IN ('passed', 'failed', 'error')`,
  );

  for (const t of dedup) {
    const rows = stmt.all(t.harness, t.providerId, t.modelId);
    if (rows.length === 0) continue;
    cellsWithHistory += 1;
    for (const row of rows) {
      const start = Date.parse(row.started_at);
      const end = Date.parse(row.completed_at);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        allDurations.push(end - start);
      }
    }
  }

  return {
    cellsWithHistory,
    medianMs: median(allDurations),
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}
