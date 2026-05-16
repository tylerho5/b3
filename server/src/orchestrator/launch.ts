import {
  createMatrixRun,
  createRun,
  updateRunStatus,
} from "../db/runs";
import { getProvider, type Harness, type Provider } from "../db/providers";
import { supportedHarnesses } from "../providers/kinds";
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
  matrix: Array<{ harness: Harness; providerId: string; modelId: string; effort?: string }>;
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
  if (harness === "claude_code") return new ClaudeCodeAdapter();
  if (harness === "codex") return new CodexAdapter();
  throw new Error(`unknown harness: ${harness}`);
}

export function launchMatrixRun(
  app: AppState,
  input: LaunchInput,
): { matrixRunId: string; cellRunIds: string[] } {
  const task = getTask(app.db, input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);

  // Validate cells before entering the transaction (reads are harmless).
  const cellSpecs: RunCellSpec[] = [];
  for (const cell of input.matrix) {
    const provider = getProvider(app.db, cell.providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${cell.providerId}`);
    }
    if (!supportedHarnesses(provider.kind).includes(cell.harness)) {
      throw new Error(
        `Provider ${provider.name} (${provider.kind}) does not support harness ${cell.harness}`,
      );
    }
    const model = getProviderModel(app.db, cell.providerId, cell.modelId, cell.effort);
    if (!model) {
      const effortSuffix = cell.effort ? ` (effort: ${cell.effort})` : "";
      throw new Error(
        `Provider model not found: ${cell.providerId} / ${cell.modelId}${effortSuffix}`,
      );
    }
    cellSpecs.push({ runId: "", harness: cell.harness, provider, model });
  }

  // Write matrix + runs in a single transaction so failure rolls back.
  const matrixId = app.db.transaction(() => {
    const mid = createMatrixRun(app.db, {
      taskId: input.taskId,
      skillIds: input.skillIds,
      concurrency: input.concurrency,
    });
    for (const spec of cellSpecs) {
      spec.runId = createRun(app.db, {
        matrixRunId: mid,
        harness: spec.harness,
        providerId: spec.provider.id,
        modelId: spec.model.modelId,
        effort: spec.model.effort,
        worktreePath: "",
      });
    }
    return mid;
  })();

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
