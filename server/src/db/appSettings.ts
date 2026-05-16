import type { DB } from "./index";

export function getSetting(db: DB, key: string): string | null {
  const row = db
    .query("SELECT value FROM app_settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function putSetting(db: DB, key: string, value: string): void {
  db.run(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}
