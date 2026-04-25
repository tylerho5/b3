import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { DB } from "./index";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "migrations");

export function runMigrations(db: DB): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    (
      db.query("SELECT version FROM schema_migrations").all() as {
        version: number;
      }[]
    ).map((r) => r.version),
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const version = Number(f.match(/^(\d+)/)?.[1]);
    if (!version || applied.has(version)) continue;
    const sql = readFileSync(resolve(MIGRATIONS_DIR, f), "utf-8");
    db.transaction(() => {
      db.exec(sql);
      db.run(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
        [version, new Date().toISOString()],
      );
    })();
  }
}
