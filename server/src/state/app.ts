import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import type { DB } from "../db";
import { openDb } from "../db";
import { runMigrations } from "../db/migrations";
import { EventHub } from "./hub";
import type { B3Config } from "../config/types";
import { loadConfigOrInit, getDefaultConfigPath } from "../config/load";
import type { MatrixHandle } from "../orchestrator/runMatrix";
import type { BroadcastQueue } from "../orchestrator/broadcast";
import type { SkillBundle } from "../skills/registry";
import { discoverSkills } from "../skills/registry";

export interface ActiveMatrix {
  matrixRunId: string;
  handle: MatrixHandle;
  broadcast: BroadcastQueue;
}

export interface AppState {
  db: DB;
  hub: EventHub;
  config: B3Config;
  configPath: string;
  runsRoot: string;
  active: Map<string, ActiveMatrix>;
  skills: SkillBundle[];
  reloadConfig: () => void;
  reloadSkills: () => void;
}

export function defaultDataDir(home = homedir()): string {
  return join(home, ".local/share/b3");
}

export function defaultRunsRoot(cwd = process.cwd()): string {
  return join(cwd, "runs");
}

export function createAppState(opts?: {
  dbPath?: string;
  configPath?: string;
  runsRoot?: string;
}): AppState {
  const dataDir = defaultDataDir();
  mkdirSync(dataDir, { recursive: true });
  const dbPath = opts?.dbPath ?? join(dataDir, "b3.db");
  const configPath = opts?.configPath ?? getDefaultConfigPath();
  const runsRoot = opts?.runsRoot ?? defaultRunsRoot();
  mkdirSync(runsRoot, { recursive: true });

  const db = openDb(dbPath);
  runMigrations(db);

  const state: AppState = {
    db,
    hub: new EventHub(),
    config: loadConfigOrInit(configPath, process.env, {
      soft: true,
      onWarn: (msg) => console.warn(`[b3 config] ${msg}`),
    }),
    configPath,
    runsRoot,
    active: new Map(),
    skills: discoverSkills(),
    reloadConfig() {
      state.config = loadConfigOrInit(configPath, process.env, {
        soft: true,
        onWarn: (msg) => console.warn(`[b3 config] ${msg}`),
      });
    },
    reloadSkills() {
      state.skills = discoverSkills();
    },
  };
  return state;
}
