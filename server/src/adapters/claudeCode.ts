import { spawn, type ChildProcess } from "node:child_process";
import type { ProviderModel } from "../db/providerModels";
import { buildSpawnEnv } from "../providers/recipes";
import type {
  AdapterSpawnInput,
  HarnessAdapter,
  NormalizedEvent,
  SessionHandle,
  UsageBreakdown,
} from "./types";

interface CCRawBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
  is_error?: boolean;
  tool_use_id?: string;
}

interface CCRawEvent {
  type: string;
  subtype?: string;
  session_id?: string;
  message?: {
    role?: string;
    content?: CCRawBlock[];
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export class ClaudeCodeAdapter implements HarnessAdapter {
  readonly name = "claude_code" as const;

  async spawn(input: AdapterSpawnInput): Promise<SessionHandle> {
    const recipeEnv = buildSpawnEnv(input.provider, input.model, "claude_code");
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...recipeEnv,
    };

    const args = [
      "-p",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
      "--model",
      input.model.modelId,
    ];

    const proc = spawn("claude", args, {
      cwd: input.workdir,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const handle: SessionHandle = {
      runId: input.runId,
      process: proc as unknown as SessionHandle["process"],
      pendingMessages: [],
    };

    let turn = 0;
    let segSeq = 0;
    let buf = "";
    const onLine = (line: string) => {
      if (!line.trim()) return;
      let raw: CCRawEvent;
      try {
        raw = JSON.parse(line);
      } catch {
        return;
      }
      const evs = this.mapEvent(raw, () => ++turn, () => segSeq, handle);
      for (const ev of evs) input.onEvent(ev);
      if (evs.some((e) => e.t === "segment_end")) segSeq++;
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
      input.onEvent({
        t: "error",
        message: `[claude stderr] ${text}`,
        ts: Date.now(),
      });
    });

    proc.on("exit", (code) => {
      input.onEvent({
        t: "run_end",
        exitCode: code ?? -1,
        ts: Date.now(),
      });
    });

    input.onEvent({
      t: "segment_start",
      seq: 0,
      kind: "initial",
      message: input.initialPrompt,
      ts: Date.now(),
    });
    proc.stdin!.write(
      JSON.stringify({
        type: "user",
        message: { role: "user", content: input.initialPrompt },
      }) + "\n",
    );

    return handle;
  }

  private mapEvent(
    raw: CCRawEvent,
    nextTurn: () => number,
    currentSeg: () => number,
    handle: SessionHandle,
  ): NormalizedEvent[] {
    const ts = Date.now();
    const out: NormalizedEvent[] = [];

    if (raw.type === "system" && raw.subtype === "init") {
      if (raw.session_id) handle.sessionId = raw.session_id;
      out.push({
        t: "session_init",
        sessionId: raw.session_id ?? "",
        ts,
      });
      return out;
    }

    if (raw.type === "assistant") {
      const t = nextTurn();
      const blocks = raw.message?.content ?? [];
      for (const b of blocks) {
        if (b.type === "text" && typeof b.text === "string") {
          out.push({ t: "assistant_text", turn: t, textDelta: b.text, ts });
        } else if (b.type === "tool_use") {
          if (b.name === "Skill") {
            const inp = (b.input ?? {}) as { skill_name?: string };
            out.push({
              t: "skill_invoked",
              skillName: String(inp.skill_name ?? ""),
              ts,
            });
          }
          out.push({
            t: "tool_call",
            turn: t,
            toolName: String(b.name ?? ""),
            argsPreview: JSON.stringify(b.input ?? {}).slice(0, 200),
            ts,
          });
        }
      }
      if (raw.usage) {
        out.push({
          t: "usage",
          input: raw.usage.input_tokens ?? 0,
          output: raw.usage.output_tokens ?? 0,
          cacheRead: raw.usage.cache_read_input_tokens ?? 0,
          cacheWrite: raw.usage.cache_creation_input_tokens ?? 0,
          ts,
        });
      }
      return out;
    }

    if (raw.type === "user") {
      const blocks = raw.message?.content ?? [];
      for (const b of blocks) {
        if (b?.type === "tool_result") {
          out.push({
            t: "tool_result",
            turn: 0,
            toolName: "",
            ok: !b.is_error,
            durationMs: 0,
            ts,
          });
        }
      }
      return out;
    }

    if (raw.type === "result") {
      if (raw.usage) {
        out.push({
          t: "usage",
          input: raw.usage.input_tokens ?? 0,
          output: raw.usage.output_tokens ?? 0,
          cacheRead: raw.usage.cache_read_input_tokens ?? 0,
          cacheWrite: raw.usage.cache_creation_input_tokens ?? 0,
          ts,
        });
      }
      out.push({ t: "segment_end", seq: currentSeg(), ts });
      return out;
    }

    return out;
  }

  async injectMessage(handle: SessionHandle, text: string): Promise<void> {
    handle.pendingMessages.push(text);
    const proc = handle.process as unknown as ChildProcess;
    proc.stdin!.write(
      JSON.stringify({
        type: "user",
        message: { role: "user", content: text },
      }) + "\n",
    );
  }

  async interrupt(handle: SessionHandle): Promise<void> {
    const proc = handle.process as unknown as ChildProcess;
    proc.kill("SIGINT");
  }

  async close(handle: SessionHandle): Promise<void> {
    const proc = handle.process as unknown as ChildProcess;
    try {
      proc.stdin!.end();
    } catch {
      // already ended
    }
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

  estimateCost(usage: UsageBreakdown, model: ProviderModel): number | null {
    if (model.inputCostPerMtok == null || model.outputCostPerMtok == null) {
      return null;
    }
    return (
      (usage.input / 1_000_000) * model.inputCostPerMtok +
      (usage.output / 1_000_000) * model.outputCostPerMtok
    );
  }
}
