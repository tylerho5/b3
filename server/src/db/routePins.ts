import type { DB } from "./index";

export function setPin(db: DB, modelName: string, routeId: string): void {
  db.run(
    `INSERT INTO model_route_pins (model_name, route_id)
     VALUES (?, ?)
     ON CONFLICT (model_name) DO UPDATE SET route_id = excluded.route_id`,
    [modelName, routeId],
  );
}

export function getPin(db: DB, modelName: string): string | null {
  const row = db
    .query(`SELECT route_id FROM model_route_pins WHERE model_name = ?`)
    .get(modelName) as { route_id: string } | undefined;
  return row?.route_id ?? null;
}

export function listPins(db: DB): Record<string, string> {
  const rows = db
    .query(`SELECT model_name, route_id FROM model_route_pins`)
    .all() as { model_name: string; route_id: string }[];
  const out: Record<string, string> = {};
  for (const r of rows) out[r.model_name] = r.route_id;
  return out;
}

export function deletePin(db: DB, modelName: string): void {
  db.run(`DELETE FROM model_route_pins WHERE model_name = ?`, [modelName]);
}
