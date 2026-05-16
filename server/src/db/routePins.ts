import type { DB } from "./index";

export function setPin(db: DB, modelName: string, harness: string, routeId: string): void {
  db.run(
    `INSERT INTO model_route_pins (model_name, harness, route_id)
     VALUES (?, ?, ?)
     ON CONFLICT (model_name, harness) DO UPDATE SET route_id = excluded.route_id`,
    [modelName, harness, routeId],
  );
}

export function getPin(db: DB, modelName: string, harness: string): string | null {
  const row = db
    .query(`SELECT route_id FROM model_route_pins WHERE model_name = ? AND harness = ?`)
    .get(modelName, harness) as { route_id: string } | undefined;
  return row?.route_id ?? null;
}

export function listPins(db: DB): Record<string, Record<string, string>> {
  const rows = db
    .query(`SELECT model_name, harness, route_id FROM model_route_pins`)
    .all() as { model_name: string; harness: string; route_id: string }[];
  const out: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    if (!out[r.model_name]) out[r.model_name] = {};
    out[r.model_name][r.harness] = r.route_id;
  }
  return out;
}

export function deletePin(db: DB, modelName: string, harness: string): void {
  db.run(`DELETE FROM model_route_pins WHERE model_name = ? AND harness = ?`, [modelName, harness]);
}
