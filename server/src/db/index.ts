import { Database } from "bun:sqlite";

export type DB = Database;

export function openDb(path: string): DB {
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}
