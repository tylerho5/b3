import type { DB } from "./index";

export interface StoredEvent {
  id: number;
  runId: string;
  segmentSeq: number;
  tsMs: number;
  type: string;
  payload: unknown;
}

interface EventRow {
  id: number;
  run_id: string;
  segment_seq: number;
  ts_ms: number;
  type: string;
  payload_json: string;
}

function rowToEvent(r: EventRow): StoredEvent {
  return {
    id: r.id,
    runId: r.run_id,
    segmentSeq: r.segment_seq,
    tsMs: r.ts_ms,
    type: r.type,
    payload: JSON.parse(r.payload_json),
  };
}

export function appendEvent(
  db: DB,
  runId: string,
  segmentSeq: number,
  tsMs: number,
  type: string,
  payload: unknown,
): void {
  db.run(
    `INSERT INTO events (run_id, segment_seq, ts_ms, type, payload_json)
     VALUES (?, ?, ?, ?, ?)`,
    [runId, segmentSeq, tsMs, type, JSON.stringify(payload)],
  );
}

export function listEvents(db: DB, runId: string): StoredEvent[] {
  const rows = db
    .query("SELECT * FROM events WHERE run_id = ? ORDER BY ts_ms, id")
    .all(runId) as EventRow[];
  return rows.map(rowToEvent);
}
