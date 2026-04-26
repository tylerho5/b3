import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppState, type AppState } from "../src/state/app";
import { handleRequest } from "../src/api/routes";

export interface TestApp {
  app: AppState;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  cleanup: () => void;
}

export function createTestApp(): TestApp {
  const root = mkdtempSync(join(tmpdir(), "b3-test-"));
  const runsRoot = join(root, "runs");
  Bun.spawnSync(["mkdir", "-p", runsRoot]);
  const app = createAppState({
    dbPath: ":memory:",
    runsRoot,
    importLegacyToml: false,
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
