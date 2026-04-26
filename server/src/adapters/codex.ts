import { spawn, type ChildProcess } from "node:child_process";
import type { ModelCard, ProviderConfig } from "../config/types";
import type { ProviderKind, Provider } from "../db/providers";
import type { ProviderModel } from "../db/providerModels";
import { buildSpawnEnv, type SpawnEnv } from "../providers/recipes";
import type {
  AdapterSpawnInput,
  HarnessAdapter,
  NormalizedEvent,
  SessionHandle,
  UsageBreakdown,
} from "./types";

// Phase 1 bridge — see claudeCode.ts. Phase 4 deletes this once the
// orchestrator passes DB-shaped Provider rows directly.
export function inferCodexKind(env: Record<string, string>): ProviderKind {
  const baseUrl = env.OPENAI_BASE_URL;
  const hasKey = !!env.OPENAI_API_KEY;
  if (!baseUrl && !hasKey) return "codex_subscription";
  if (baseUrl && baseUrl.includes("openrouter.ai")) return "openrouter";
  if (baseUrl) return "custom_openai_compat";
  return "openai_api_direct";
}

export function legacyToCodexSpawnEnv(
  provider: ProviderConfig,
  model: ModelCard,
): SpawnEnv {
  // codex_profile is a Codex-CLI-side mechanism (selects a profile from
  // ~/.codex/config.toml). The recipe layer has no equivalent; bypass it and
  // let process.env + the -p flag carry the auth. Phase 4 will revisit.
  if (provider.codexProfile) return {};

  const kind = inferCodexKind(provider.env);
  const synthProvider: Provider = {
    id: provider.id,
    name: provider.label,
    kind,
    baseUrl: provider.env.OPENAI_BASE_URL ?? null,
    apiKey: provider.env.OPENAI_API_KEY ?? null,
    apiKeyEnvRef: null,
    createdAt: "",
    updatedAt: "",
  };
  const synthModel: ProviderModel = {
    id: provider.id + ":" + model.id,
    providerId: provider.id,
    modelId: model.id,
    displayName: model.id,
    contextLength: null,
    inputCostPerMtok: model.inputCostPerMtok ?? null,
    outputCostPerMtok: model.outputCostPerMtok ?? null,
    tier: model.tier ?? null,
    supportedParameters: null,
    addedAt: "",
  };
  return buildSpawnEnv(synthProvider, synthModel, "codex");
}

interface CodexRawItem {
  type?: string;
  text?: string;
  name?: string;
  command?: string;
  arguments?: unknown;
  ok?: boolean;
  error?: string;
  duration_ms?: number;
}

interface CodexRawEvent {
  type: string;
  thread_id?: string;
  item?: CodexRawItem;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cached_input_tokens?: number;
  };
  error?: string | { message?: string };
}

export class CodexAdapter implements HarnessAdapter {
  readonly name = "codex" as const;

  async spawn(input: AdapterSpawnInput): Promise<SessionHandle> {
    const recipeEnv = legacyToCodexSpawnEnv(input.provider, input.model);
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...input.env,
      ...recipeEnv,
    };

    const args = [
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--full-auto",
      "-m",
      input.model.id,
    ];
    if (input.provider.codexProfile) {
      args.push("-p", input.provider.codexProfile);
    }
    args.push(input.initialPrompt);

    const proc = spawn("codex", args, {
      cwd: input.workdir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const handle: SessionHandle = {
      runId: input.runId,
      process: proc as unknown as SessionHandle["process"],
      pendingMessages: [],
    };

    input.onEvent({
      t: "segment_start",
      seq: 0,
      kind: "initial",
      message: input.initialPrompt,
      ts: Date.now(),
    });

    let segSeq = 0;
    let turn = 0;
    this.attachStdout(proc, handle, () => segSeq, () => turn, (n) => {
      turn = n;
    }, (n) => {
      segSeq = n;
    }, input.onEvent);

    return handle;
  }

  private attachStdout(
    proc: ChildProcess,
    handle: SessionHandle,
    getSeg: () => number,
    getTurn: () => number,
    setTurn: (n: number) => void,
    setSeg: (n: number) => void,
    onEvent: (ev: NormalizedEvent) => void,
  ): void {
    let buf = "";

    const onLine = (line: string) => {
      if (!line.trim()) return;
      let raw: CodexRawEvent;
      try {
        raw = JSON.parse(line);
      } catch {
        return;
      }
      const evs = this.mapEvent(
        raw,
        () => {
          const t = getTurn() + 1;
          setTurn(t);
          return t;
        },
        getSeg,
        handle,
      );
      for (const ev of evs) onEvent(ev);
      if (evs.some((e) => e.t === "segment_end")) setSeg(getSeg() + 1);
    };

    proc.stdout!.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf-8");
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        onLine(line);
      }
    });

    proc.stderr!.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      onEvent({
        t: "error",
        message: `[codex stderr] ${text}`,
        ts: Date.now(),
      });
    });

    proc.on("exit", (code) => {
      onEvent({
        t: "run_end",
        exitCode: code ?? -1,
        ts: Date.now(),
      });
    });
  }

  private mapEvent(
    raw: CodexRawEvent,
    nextTurn: () => number,
    currentSeg: () => number,
    handle: SessionHandle,
  ): NormalizedEvent[] {
    const ts = Date.now();
    const out: NormalizedEvent[] = [];

    if (raw.type === "thread.started") {
      if (raw.thread_id) handle.sessionId = raw.thread_id;
      out.push({ t: "session_init", sessionId: raw.thread_id ?? "", ts });
      return out;
    }

    if (raw.type === "turn.started") {
      out.push({ t: "turn_start", turn: nextTurn(), ts });
      return out;
    }

    if (raw.type === "item.started" && raw.item) {
      const it = raw.item;
      if (it.type === "command_execution" || it.type === "mcp_tool_call") {
        out.push({
          t: "tool_call",
          turn: 0,
          toolName: String(it.type),
          argsPreview: JSON.stringify(it.arguments ?? it.command ?? "").slice(
            0,
            200,
          ),
          ts,
        });
      }
      return out;
    }

    if (raw.type === "item.completed" && raw.item) {
      const it = raw.item;
      if (it.type === "agent_message" && typeof it.text === "string") {
        out.push({
          t: "assistant_text",
          turn: 0,
          textDelta: it.text,
          ts,
        });
      } else if (
        it.type === "command_execution" ||
        it.type === "mcp_tool_call"
      ) {
        out.push({
          t: "tool_result",
          turn: 0,
          toolName: String(it.type),
          ok: it.ok !== false && !it.error,
          durationMs: Number(it.duration_ms ?? 0),
          ts,
        });
      }
      return out;
    }

    if (raw.type === "turn.completed") {
      if (raw.usage) {
        out.push({
          t: "usage",
          input: raw.usage.input_tokens ?? 0,
          output: raw.usage.output_tokens ?? 0,
          cacheRead: raw.usage.cached_input_tokens ?? 0,
          cacheWrite: 0,
          ts,
        });
      }
      out.push({ t: "segment_end", seq: currentSeg(), ts });
      return out;
    }

    if (raw.type === "turn.failed") {
      const msg =
        typeof raw.error === "string"
          ? raw.error
          : raw.error?.message ?? "turn failed";
      out.push({ t: "error", message: msg, ts });
      out.push({ t: "segment_end", seq: currentSeg(), ts });
      return out;
    }

    return out;
  }

  async injectMessage(handle: SessionHandle, text: string): Promise<void> {
    handle.pendingMessages.push(text);
  }

  async flushQueued(handle: SessionHandle): Promise<void> {
    if (!handle.sessionId || handle.pendingMessages.length === 0) return;
    // Resume is implemented by the orchestrator owning the spawn context.
    // The adapter exposes the pendingMessages queue; concrete resume happens
    // via spawnResume() below which the orchestrator calls.
  }

  async spawnResume(input: {
    handle: SessionHandle;
    workdir: string;
    env: Record<string, string>;
    text: string;
    modelId: string;
    codexProfile?: string;
    onEvent: (ev: NormalizedEvent) => void;
  }): Promise<void> {
    const sessionId = input.handle.sessionId;
    if (!sessionId) throw new Error("Codex resume requires sessionId");

    const args = [
      "exec",
      "resume",
      "--json",
      "-m",
      input.modelId,
    ];
    if (input.codexProfile) args.push("-p", input.codexProfile);
    args.push(sessionId);
    args.push(input.text);

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...input.env,
    };
    const proc = spawn("codex", args, {
      cwd: input.workdir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    input.handle.process = proc as unknown as SessionHandle["process"];

    let segSeq = 0;
    let turn = 0;
    this.attachStdout(
      proc,
      input.handle,
      () => segSeq,
      () => turn,
      (n) => {
        turn = n;
      },
      (n) => {
        segSeq = n;
      },
      input.onEvent,
    );
  }

  async interrupt(handle: SessionHandle): Promise<void> {
    const proc = handle.process as unknown as ChildProcess;
    proc.kill("SIGINT");
  }

  async close(handle: SessionHandle): Promise<void> {
    const proc = handle.process as unknown as ChildProcess;
    if (proc.exitCode == null) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {
            // ignore
          }
          resolve();
        }, 5000);
        proc.on("exit", () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  estimateCost(usage: UsageBreakdown, model: ModelCard): number | null {
    if (model.inputCostPerMtok == null || model.outputCostPerMtok == null) {
      return null;
    }
    return (
      (usage.input / 1_000_000) * model.inputCostPerMtok +
      (usage.output / 1_000_000) * model.outputCostPerMtok
    );
  }
}
