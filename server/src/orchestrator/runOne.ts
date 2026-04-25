import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DB } from "../db";
import { appendEvent } from "../db/events";
import {
  getRun,
  incrementRunTurns,
  incrementRunUsage,
  setRunSessionId,
  updateRunStatus,
} from "../db/runs";
import { closeSegment, createSegment } from "../db/segments";
import {
  captureDiff,
  createWorktree,
} from "../worktree/manager";
import { materializeSkills } from "../skills/materialize";
import type { SkillBundle } from "../skills/registry";
import type { MaterializeMode } from "../skills/materialize";
import type {
  HarnessAdapter,
  NormalizedEvent,
  SessionHandle,
} from "../adapters/types";
import type { ModelCard, ProviderConfig } from "../config/types";
import { runTestPhase as defaultRunTestPhase } from "./testRunner";

export interface RunOneInput {
  db: DB;
  runId: string;
  prompt: string;
  timeBudgetS: number;
  baseRepo: string | null;
  baseCommit: string | null;
  runsRoot: string;
  provider: ProviderConfig;
  model: ModelCard;
  skillBundles: SkillBundle[];
  skillMode: MaterializeMode;
  adapter: HarnessAdapter;
  testCommand: string | null;
  broadcast: (ev: NormalizedEvent & { runId: string }) => void;
  runTestPhase?: (input: {
    workdir: string;
    testCommand: string;
    timeoutMs: number;
  }) => Promise<{ exitCode: number; logPath: string }>;
}

export async function runOne(input: RunOneInput): Promise<void> {
  const {
    db,
    runId,
    prompt,
    baseRepo,
    baseCommit,
    runsRoot,
    provider,
    model,
    skillBundles,
    skillMode,
    adapter,
    testCommand,
    broadcast,
  } = input;

  updateRunStatus(db, runId, "running");

  const wt = await createWorktree({ runId, baseRepo, baseCommit, runsRoot });
  const runDir = join(runsRoot, runId);
  await materializeSkills(wt.workdir, skillBundles, skillMode);

  let currentSeg = 0;
  let segmentInputTokens = 0;
  let segmentOutputTokens = 0;
  let segmentCost = 0;
  let totalTurns = 0;

  let segmentEndResolve: (() => void) | null = null;
  const waitSegmentEnd = () =>
    new Promise<void>((resolve) => {
      segmentEndResolve = resolve;
    });

  const onEvent = (ev: NormalizedEvent) => {
    appendEvent(db, runId, currentSeg, ev.ts, ev.t, ev);
    broadcast({ ...ev, runId });

    if (ev.t === "session_init" && ev.sessionId) {
      setRunSessionId(db, runId, ev.sessionId);
    }
    if (ev.t === "usage") {
      const cost =
        adapter.estimateCost(
          {
            input: ev.input,
            output: ev.output,
            cacheRead: ev.cacheRead,
            cacheWrite: ev.cacheWrite,
          },
          model,
        ) ?? 0;
      incrementRunUsage(db, runId, {
        input: ev.input,
        output: ev.output,
        cacheRead: ev.cacheRead,
        cacheWrite: ev.cacheWrite,
        costUsd: cost,
      });
      segmentInputTokens += ev.input;
      segmentOutputTokens += ev.output;
      segmentCost += cost;
    }
    if (ev.t === "turn_start" || ev.t === "assistant_text") {
      // turn counter is approximate — bump on assistant_text or turn_start
      if (ev.t === "turn_start") {
        totalTurns++;
        incrementRunTurns(db, runId, 1);
      }
    }
    if (ev.t === "segment_end") {
      closeSegment(db, runId, currentSeg, {
        inputTokens: segmentInputTokens || null,
        outputTokens: segmentOutputTokens || null,
        costUsd: segmentCost || null,
      });
      currentSeg++;
      segmentInputTokens = 0;
      segmentOutputTokens = 0;
      segmentCost = 0;
      segmentEndResolve?.();
      segmentEndResolve = null;
    }
  };

  createSegment(db, runId, 0, "initial", null);

  let handle: SessionHandle | null = null;
  let timeoutKill: ReturnType<typeof setTimeout> | null = null;
  let killed = false;

  try {
    handle = await adapter.spawn({
      runId,
      workdir: wt.workdir,
      initialPrompt: prompt,
      env: provider.env,
      provider,
      model,
      skills: skillBundles,
      onEvent,
    });

    timeoutKill = setTimeout(() => {
      killed = true;
      adapter.interrupt(handle!).catch(() => {});
    }, input.timeBudgetS * 1000);

    await waitSegmentEnd();

    if (timeoutKill) clearTimeout(timeoutKill);
    await adapter.close(handle);

    if (killed) {
      updateRunStatus(db, runId, "canceled");
    } else {
      // Test phase
      let testsPassed: boolean | null = null;
      let testLogPath: string | null = null;
      if (testCommand) {
        updateRunStatus(db, runId, "testing");
        const phase = input.runTestPhase ?? defaultRunTestPhase;
        const result = await phase({
          workdir: wt.workdir,
          testCommand,
          timeoutMs: 60_000,
        });
        testsPassed = result.exitCode === 0;
        testLogPath = result.logPath;
      }

      // Capture diff
      const diff = await captureDiff(wt.workdir, wt.baseCommit);
      await writeFile(join(runDir, "workdir.diff"), diff);

      // Write meta.json
      const run = getRun(db, runId)!;
      const meta = {
        runId,
        harness: provider.harness,
        providerId: provider.id,
        modelId: model.id,
        baseCommit: wt.baseCommit,
        sessionId: run.sessionId,
        startedAt: run.startedAt,
        completedAt: new Date().toISOString(),
        inputTokens: run.inputTokens,
        outputTokens: run.outputTokens,
        cacheReadTokens: run.cacheReadTokens,
        cacheWriteTokens: run.cacheWriteTokens,
        costUsd: run.costUsd,
        turns: totalTurns,
        testsPassed,
        testLogPath,
      };
      await writeFile(join(runDir, "meta.json"), JSON.stringify(meta, null, 2));

      if (testCommand) {
        updateRunStatus(db, runId, testsPassed ? "passed" : "failed");
      } else {
        updateRunStatus(db, runId, "passed");
      }
    }
  } catch (err) {
    appendEvent(db, runId, currentSeg, Date.now(), "error", {
      message: (err as Error).message,
    });
    updateRunStatus(db, runId, "error");
    throw err;
  } finally {
    if (timeoutKill) clearTimeout(timeoutKill);
    if (handle) {
      try {
        await adapter.close(handle);
      } catch {
        // best effort
      }
    }
  }
}
