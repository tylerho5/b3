import { test, expect } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppState } from "../src/state/app";
import { createAppState } from "../src/state/app";
import { handleRequest } from "../src/api/routes";
import type { RunEvent } from "../src/state/hub";
import { createProvider } from "../src/db/providers";
import { addProviderModels } from "../src/db/providerModels";

function probeClaude(): boolean {
  try {
    const r = Bun.spawnSync(["claude", "--version"]);
    return r.exitCode === 0;
  } catch {
    return false;
  }
}
const HAVE_CLAUDE = probeClaude() && !process.env.B3_SKIP_CLI_TESTS;

function makeApp(): {
  app: AppState;
  cleanup: () => void;
  providerId: string;
  modelId: string;
} {
  const root = mkdtempSync(join(tmpdir(), "b3-e2e-"));
  const dbDir = join(root, "db");
  const runsRoot = join(root, "runs");
  Bun.spawnSync(["mkdir", "-p", dbDir, runsRoot]);
  const app = createAppState({
    dbPath: join(dbDir, "e2e.db"),
    runsRoot,
    importLegacyToml: false,
  });
  const provider = createProvider(app.db, {
    name: "Claude (subscription)",
    kind: "claude_subscription",
  });
  const [model] = addProviderModels(app.db, provider.id, [
    {
      modelId: "claude-haiku-4-5",
      displayName: "Claude Haiku 4.5",
      tier: "haiku",
      inputCostPerMtok: 0.8,
      outputCostPerMtok: 4.0,
    },
  ]);
  return {
    app,
    cleanup: () => {
      app.db.close();
      rmSync(root, { recursive: true, force: true });
    },
    providerId: provider.id,
    modelId: model.modelId,
  };
}

async function jreq(
  app: AppState,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return handleRequest(
    app,
    new Request(`http://127.0.0.1${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
}

test.skipIf(!HAVE_CLAUDE)(
  "e2e: launch 1-cell matrix via HTTP, WS receives events, run passes, artifacts written",
  async () => {
    const { app, cleanup, providerId, modelId } = makeApp();
    try {
      // Create task
      const taskRes = await jreq(app, "POST", "/api/tasks", {
        name: "e2e-pong",
        prompt: "Reply with exactly: PONG",
        testCommand: null,
        timeBudgetS: 60,
        judgeEnabled: false,
      });
      expect(taskRes.status).toBe(200);
      const task = (await taskRes.json()) as { id: string };
      expect(task.id).toBeTruthy();

      // Subscribe to WS hub before launch
      const captured: RunEvent[] = [];
      const subDone = new Promise<void>((resolve) => {
        // Will resolve below when first event arrives; we keep a fallback timer
        setTimeout(resolve, 0);
      });
      void subDone;

      // Launch matrix
      const launchRes = await jreq(app, "POST", "/api/runs/launch", {
        taskId: task.id,
        matrix: [
          {
            harness: "claude_code",
            providerId,
            modelId,
          },
        ],
        skillIds: [],
        concurrency: 1,
      });
      expect(launchRes.status).toBe(200);
      const launch = (await launchRes.json()) as {
        matrixRunId: string;
        cellRunIds: string[];
      };
      expect(launch.cellRunIds).toHaveLength(1);

      // Subscribe immediately after launch
      const unsub = app.hub.subscribe(launch.matrixRunId, (ev) => {
        captured.push(ev);
      });

      // Poll until run completes (or timeout)
      const runId = launch.cellRunIds[0];
      const deadline = Date.now() + 90_000;
      let run: { status: string; completedAt: string | null } | null = null;
      while (Date.now() < deadline) {
        const r = await jreq(
          app,
          "GET",
          `/api/runs/${launch.matrixRunId}/${runId}`,
        );
        if (r.status === 200) {
          const body = (await r.json()) as {
            run: { status: string; completedAt: string | null };
          };
          run = body.run;
          if (
            run.status === "passed" ||
            run.status === "failed" ||
            run.status === "error" ||
            run.status === "canceled"
          ) {
            break;
          }
        }
        await new Promise((r2) => setTimeout(r2, 500));
      }
      unsub();

      expect(run).not.toBeNull();
      expect(run!.status).toBe("passed");
      expect(run!.completedAt).not.toBeNull();

      // WS hub captured events
      expect(captured.length).toBeGreaterThan(0);
      const types = captured.map((c) => c.event.t);
      expect(types).toContain("session_init");
      expect(types).toContain("segment_end");

      // Detail call returns segments and events
      const detail = (await (
        await jreq(
          app,
          "GET",
          `/api/runs/${launch.matrixRunId}/${runId}`,
        )
      ).json()) as {
        segments: { seq: number }[];
        events: { type: string }[];
        diff: string | null;
        meta: unknown;
      };
      expect(detail.segments.length).toBeGreaterThan(0);
      expect(detail.events.length).toBeGreaterThan(0);
      expect(detail.meta).not.toBeNull();

      // Worktree artifacts exist on disk
      const runDir = join(app.runsRoot, runId);
      expect(existsSync(join(runDir, "workdir"))).toBe(true);
      expect(existsSync(join(runDir, "workdir.diff"))).toBe(true);
      expect(existsSync(join(runDir, "meta.json"))).toBe(true);
      const meta = JSON.parse(
        readFileSync(join(runDir, "meta.json"), "utf-8"),
      );
      expect(meta.runId).toBe(runId);
      expect(meta.harness).toBe("claude_code");
    } finally {
      cleanup();
    }
  },
  150_000,
);
