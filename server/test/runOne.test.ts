import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type DB } from "../src/db";
import { runMigrations } from "../src/db/migrations";
import { createTask } from "../src/db/tasks";
import {
  createMatrixRun,
  createRun,
  getRun,
} from "../src/db/runs";
import { listEvents } from "../src/db/events";
import { runOne } from "../src/orchestrator/runOne";
import { ClaudeCodeAdapter } from "../src/adapters/claudeCode";
import type { ProviderConfig } from "../src/config/types";

function probeClaude(): boolean {
  try {
    const r = Bun.spawnSync(["claude", "--version"]);
    return r.exitCode === 0;
  } catch {
    return false;
  }
}
const HAVE_CLAUDE = probeClaude() && !process.env.B3_SKIP_CLI_TESTS;

function setupDb(): { db: DB; cleanup: () => void } {
  const db = openDb(":memory:");
  runMigrations(db);
  return { db, cleanup: () => db.close() };
}

test.skipIf(!HAVE_CLAUDE)(
  "runOne: spawns adapter, persists events, marks run passed",
  async () => {
    const runsRoot = mkdtempSync(join(tmpdir(), "b3-orch-"));
    const { db, cleanup } = setupDb();
    try {
      const taskId = createTask(db, {
        name: "smoke",
        prompt: "Reply with exactly: PONG",
        baseRepo: null,
        baseCommit: null,
        testCommand: null,
        timeBudgetS: 60,
        judgeEnabled: false,
      });
      const matrixId = createMatrixRun(db, {
        taskId,
        skillIds: [],
        concurrency: 1,
      });
      const runId = createRun(db, {
        matrixRunId: matrixId,
        harness: "claude_code",
        providerId: "anthropic-direct",
        modelId: "claude-haiku-4-5",
        worktreePath: "",
      });
      const provider: ProviderConfig = {
        harness: "claude_code",
        id: "anthropic-direct",
        label: "Anthropic",
        pricingMode: "per_token",
        env: {},
        models: [],
      };
      const adapter = new ClaudeCodeAdapter();
      const wsBroadcasts: unknown[] = [];

      await runOne({
        db,
        runId,
        prompt: "Reply with exactly: PONG",
        timeBudgetS: 60,
        baseRepo: null,
        baseCommit: null,
        runsRoot,
        provider,
        model: { id: "claude-haiku-4-5", tier: "haiku" },
        skillBundles: [],
        skillMode: "copy",
        adapter,
        testCommand: null,
        broadcast: (ev) => wsBroadcasts.push(ev),
      });

      const persisted = listEvents(db, runId);
      expect(persisted.length).toBeGreaterThan(0);
      expect(persisted.map((e) => e.type)).toContain("session_init");
      expect(persisted.map((e) => e.type)).toContain("segment_end");

      const run = getRun(db, runId)!;
      expect(run.status).toBe("passed");
      expect(run.completedAt).not.toBeNull();
      expect(wsBroadcasts.length).toBeGreaterThan(0);

      const runDir = join(runsRoot, runId);
      expect(existsSync(join(runDir, "workdir"))).toBe(true);
      expect(existsSync(join(runDir, "workdir.diff"))).toBe(true);
      const meta = JSON.parse(
        readFileSync(join(runDir, "meta.json"), "utf-8"),
      );
      expect(meta.runId).toBe(runId);
      expect(meta.harness).toBe("claude_code");
    } finally {
      cleanup();
      rmSync(runsRoot, { recursive: true, force: true });
    }
  },
  120_000,
);

test.skipIf(!HAVE_CLAUDE)(
  "runOne: aggregates input/output tokens onto run row",
  async () => {
    const runsRoot = mkdtempSync(join(tmpdir(), "b3-orch-"));
    const { db, cleanup } = setupDb();
    try {
      const taskId = createTask(db, {
        name: "smoke",
        prompt: "Reply with exactly: PONG",
        baseRepo: null,
        baseCommit: null,
        testCommand: null,
        timeBudgetS: 60,
        judgeEnabled: false,
      });
      const matrixId = createMatrixRun(db, {
        taskId,
        skillIds: [],
        concurrency: 1,
      });
      const runId = createRun(db, {
        matrixRunId: matrixId,
        harness: "claude_code",
        providerId: "anthropic-direct",
        modelId: "claude-haiku-4-5",
        worktreePath: "",
      });
      const provider: ProviderConfig = {
        harness: "claude_code",
        id: "anthropic-direct",
        label: "Anthropic",
        pricingMode: "per_token",
        env: {},
        models: [],
      };
      await runOne({
        db,
        runId,
        prompt: "Reply with exactly: PONG",
        timeBudgetS: 60,
        baseRepo: null,
        baseCommit: null,
        runsRoot,
        provider,
        model: {
          id: "claude-haiku-4-5",
          tier: "haiku",
          inputCostPerMtok: 0.8,
          outputCostPerMtok: 4.0,
        },
        skillBundles: [],
        skillMode: "copy",
        adapter: new ClaudeCodeAdapter(),
        testCommand: null,
        broadcast: () => {},
      });
      const run = getRun(db, runId)!;
      expect(run.outputTokens).toBeGreaterThan(0);
    } finally {
      cleanup();
      rmSync(runsRoot, { recursive: true, force: true });
    }
  },
  120_000,
);
