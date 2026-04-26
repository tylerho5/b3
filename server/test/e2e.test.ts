import { test, expect } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppState } from "../src/state/app";
import { createAppState } from "../src/state/app";
import { handleRequest } from "../src/api/routes";
import type { RunEvent } from "../src/state/hub";

function probeClaude(): boolean {
  try {
    const r = Bun.spawnSync(["claude", "--version"]);
    return r.exitCode === 0;
  } catch {
    return false;
  }
}
const HAVE_CLAUDE = probeClaude() && !process.env.B3_SKIP_CLI_TESTS;

// No env interpolation in fixture — the test relies on the user's existing
// claude CLI auth (OAuth keychain). The empty env block is intentional.
const FIXTURE_TOML = `
version = 1

[judge]
template = "Task: {task_name}\\nPrompt:\\n{task_prompt}\\nTests: {test_status}\\nArtifacts: {run_path}/"

[[providers.claude_code]]
id = "anthropic-direct"
label = "Anthropic"
pricing_mode = "per_token"
models = [
  { id = "claude-haiku-4-5", tier = "haiku", input_cost_per_mtok = 0.80, output_cost_per_mtok = 4.0 },
]
`;

function makeApp(): { app: AppState; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "b3-e2e-"));
  const cfgDir = join(root, "cfg");
  const dbDir = join(root, "db");
  const runsRoot = join(root, "runs");
  const cfgPath = join(cfgDir, "config.toml");
  Bun.spawnSync(["mkdir", "-p", cfgDir, dbDir, runsRoot]);
  writeFileSync(cfgPath, FIXTURE_TOML);
  const app = createAppState({
    dbPath: join(dbDir, "e2e.db"),
    configPath: cfgPath,
    runsRoot,
  });
  return {
    app,
    cleanup: () => {
      app.db.close();
      rmSync(root, { recursive: true, force: true });
    },
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
    const { app, cleanup } = makeApp();
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
            providerId: "anthropic-direct",
            modelId: "claude-haiku-4-5",
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
