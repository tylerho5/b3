import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import type { DB } from "../db";
import { openDb } from "../db";
import { runMigrations } from "../db/migrations";
import { EventHub } from "./hub";
import type { MatrixHandle } from "../orchestrator/runMatrix";
import type { BroadcastQueue } from "../orchestrator/broadcast";
import type { SkillBundle } from "../skills/registry";
import { discoverSkills } from "../skills/registry";
import { importLegacyTomlOnce } from "../providers/importLegacyToml";

export interface ActiveMatrix {
  matrixRunId: string;
  handle: MatrixHandle;
  broadcast: BroadcastQueue;
}

export interface AppState {
  db: DB;
  hub: EventHub;
  runsRoot: string;
  active: Map<string, ActiveMatrix>;
  skills: SkillBundle[];
  reloadSkills: () => void;
}

export function defaultDataDir(home = homedir()): string {
  return process.env.B3_DATA_DIR ?? join(home, ".local/share/b3");
}

export function defaultRunsRoot(cwd = process.cwd()): string {
  return join(cwd, "runs");
}

function defaultLegacyConfigPath(home = homedir()): string {
  return process.env.B3_CONFIG_PATH ?? join(home, ".config/b3/config.toml");
}

export function createAppState(opts?: {
  dbPath?: string;
  configPath?: string;
  runsRoot?: string;
  importLegacyToml?: boolean;
}): AppState {
  const dataDir = defaultDataDir();
  mkdirSync(dataDir, { recursive: true });
  const dbPath = opts?.dbPath ?? join(dataDir, "b3.db");
  const runsRoot = opts?.runsRoot ?? defaultRunsRoot();
  mkdirSync(runsRoot, { recursive: true });

  const db = openDb(dbPath);
  runMigrations(db);

  // Default-on for production callers (no opts → reading user's home dir).
  // Tests that pass an explicit dbPath get default-off so the importer
  // doesn't reach into the dev's actual ~/.config/b3.
  const shouldImport = opts?.importLegacyToml ?? opts === undefined;
  if (shouldImport) {
    const importResult = importLegacyTomlOnce({
      db,
      configPath: opts?.configPath ?? defaultLegacyConfigPath(),
    });
    if (importResult.imported) {
      console.log(
        `[b3] imported legacy TOML: ${importResult.providersAdded} providers, ${importResult.modelsAdded} models`,
      );
    }
  }

  const state: AppState = {
    db,
    hub: new EventHub(),
    runsRoot,
    active: new Map(),
    skills: discoverSkills(),
    reloadSkills() {
      state.skills = discoverSkills();
    },
  };
  return state;
}
