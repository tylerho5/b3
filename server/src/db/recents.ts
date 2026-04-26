import type { DB } from "./index";

export function addRecent(db: DB, modelName: string, nowMs = Date.now()): void {
  db.run(
    `INSERT INTO recent_models (model_name, last_used_at)
     VALUES (?, ?)
     ON CONFLICT (model_name) DO UPDATE SET last_used_at = excluded.last_used_at`,
    [modelName, nowMs],
  );
}

export function listRecent(db: DB, limit = 10): string[] {
  const rows = db
    .query(
      `SELECT model_name FROM recent_models ORDER BY last_used_at DESC LIMIT ?`,
    )
    .all(limit) as { model_name: string }[];
  return rows.map((r) => r.model_name);
}
