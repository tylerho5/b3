import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppState, type AppState } from "../src/state/app";
import { handleRequest } from "../src/api/routes";

export interface TestApp {
  app: AppState;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  cleanup: () => void;
}

const MIN_TOML = `
version = 1

[judge]
template = "n/a"
`;

export function createTestApp(opts?: { tomlText?: string }): TestApp {
  const root = mkdtempSync(join(tmpdir(), "b3-test-"));
  const cfgDir = join(root, "cfg");
  const dbDir = join(root, "db");
  const runsRoot = join(root, "runs");
  Bun.spawnSync(["mkdir", "-p", cfgDir, dbDir, runsRoot]);
  const cfgPath = join(cfgDir, "config.toml");
  writeFileSync(cfgPath, opts?.tomlText ?? MIN_TOML);
  const app = createAppState({
    dbPath: ":memory:",
    configPath: cfgPath,
    runsRoot,
  });
  const fetchLocal = async (
    path: string,
    init: RequestInit = {},
  ): Promise<Response> => {
    const req = new Request(`http://test.local${path}`, init);
    return handleRequest(app, req);
  };
  return {
    app,
    fetch: fetchLocal,
    cleanup: () => {
      try {
        app.db.close();
      } catch {
        // ignore — already closed
      }
      rmSync(root, { recursive: true, force: true });
    },
  };
}
