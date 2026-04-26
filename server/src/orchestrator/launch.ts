import {
  createMatrixRun,
  createRun,
  updateRunStatus,
} from "../db/runs";
import { getProvider, type Harness, type Provider } from "../db/providers";
import {
  getProviderModel,
  type ProviderModel,
} from "../db/providerModels";
import { getTask } from "../db/tasks";
import { runOne } from "./runOne";
import { runMatrix } from "./runMatrix";
import { BroadcastQueue } from "./broadcast";
import { ClaudeCodeAdapter } from "../adapters/claudeCode";
import { CodexAdapter } from "../adapters/codex";
import type { AppState, ActiveMatrix } from "../state/app";
import type { HarnessAdapter, NormalizedEvent } from "../adapters/types";
import type { MaterializeMode } from "../skills/materialize";

export interface LaunchInput {
  taskId: string;
  matrix: Array<{ harness: Harness; providerId: string; modelId: string }>;
  skillIds: string[];
  concurrency: number;
}

interface RunCellSpec {
  runId: string;
  harness: Harness;
  provider: Provider;
  model: ProviderModel;
}

function adapterFor(harness: Harness): HarnessAdapter {
  return harness === "claude_code" ? new ClaudeCodeAdapter() : new CodexAdapter();
}

export function launchMatrixRun(
  app: AppState,
  input: LaunchInput,
): { matrixRunId: string; cellRunIds: string[] } {
  const task = getTask(app.db, input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);

  const matrixId = createMatrixRun(app.db, {
    taskId: input.taskId,
    skillIds: input.skillIds,
    concurrency: input.concurrency,
  });

  const cellSpecs: RunCellSpec[] = [];
  for (const cell of input.matrix) {
    const provider = getProvider(app.db, cell.providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${cell.providerId}`);
    }
    const model = getProviderModel(app.db, cell.providerId, cell.modelId);
    if (!model) {
      throw new Error(
        `Provider model not found: ${cell.providerId} / ${cell.modelId}`,
      );
    }
    const runId = createRun(app.db, {
      matrixRunId: matrixId,
      harness: cell.harness,
      providerId: cell.providerId,
      modelId: cell.modelId,
      worktreePath: "",
    });
    cellSpecs.push({
      runId,
      harness: cell.harness,
      provider,
      model,
    });
  }

  const skillBundles = app.skills.filter((s) => input.skillIds.includes(s.id));
  const skillMode: MaterializeMode = "copy";

  const broadcast = new BroadcastQueue();
  broadcast.onEvent((bev) => {
    app.hub.publish({
      matrixRunId: matrixId,
      runId: bev.runId,
      event: bev as unknown as NormalizedEvent,
    });
  });

  const handleByRun = new Map<string, () => Promise<void>>();
  // The adapter's session handle is owned inside runOne; we expose injection via
  // a side-channel by storing per-run "inject" callbacks here when runOne starts.

  const runOneFn = async ({
    runId,
    signal,
  }: {
    runId: string;
    signal?: AbortSignal;
  }) => {
    const spec = cellSpecs.find((c) => c.runId === runId)!;
    const adapter = adapterFor(spec.harness);

    let injectCb: (text: string) => Promise<void> = async () => {};
    handleByRun.set(runId, async () => {});

    // We register for broadcast later, after we have a working session handle.
    // To keep that wiring inside the orchestrator, runOne is wrapped here so we
    // can intercept the adapter spawn.
    const wrappedAdapter: HarnessAdapter = {
      ...adapter,
      name: adapter.name,
      async spawn(spawnInput) {
        const handle = await adapter.spawn(spawnInput);
        injectCb = async (text: string) => {
          await adapter.injectMessage(handle, text);
        };
        broadcast.register(runId, injectCb);
        return handle;
      },
      async injectMessage(handle, text) {
        return adapter.injectMessage(handle, text);
      },
      async interrupt(handle) {
        return adapter.interrupt(handle);
      },
      async close(handle) {
        broadcast.unregister(runId);
        return adapter.close(handle);
      },
      estimateCost(usage, model) {
        return adapter.estimateCost(usage, model);
      },
    };
    if (adapter.flushQueued) {
      wrappedAdapter.flushQueued = (h) => adapter.flushQueued!(h);
    }

    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          updateRunStatus(app.db, runId, "canceled");
        },
        { once: true },
      );
    }

    await runOne({
      db: app.db,
      runId,
      prompt: task.prompt,
      timeBudgetS: task.timeBudgetS,
      baseRepo: task.baseRepo,
      baseCommit: task.baseCommit,
      runsRoot: app.runsRoot,
      provider: spec.provider,
      model: spec.model,
      harness: spec.harness,
      skillBundles,
      skillMode,
      adapter: wrappedAdapter,
      testCommand: task.testCommand,
      broadcast: (ev) => {
        app.hub.publish({
          matrixRunId: matrixId,
          runId: ev.runId,
          event: ev,
        });
        if (ev.t === "segment_end") {
          void broadcast.notifySegmentEnd(runId);
        }
      },
    });
  };

  const handle = runMatrix({
    db: app.db,
    matrixRunId: matrixId,
    runIds: cellSpecs.map((c) => c.runId),
    concurrency: input.concurrency,
    runOneFn,
  });

  const active: ActiveMatrix = {
    matrixRunId: matrixId,
    handle,
    broadcast,
  };
  app.active.set(matrixId, active);
  void handle.done.finally(() => {
    app.active.delete(matrixId);
  });

  return {
    matrixRunId: matrixId,
    cellRunIds: cellSpecs.map((c) => c.runId),
  };
}
