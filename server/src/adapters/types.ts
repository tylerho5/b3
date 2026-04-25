import type { Subprocess } from "bun";
import type { ModelCard, ProviderConfig } from "../config/types";
import type { SkillBundle } from "../skills/registry";

export type SegKind = "initial" | "followup" | "broadcast";

export type NormalizedEvent =
  | { t: "session_init"; sessionId: string; ts: number }
  | {
      t: "segment_start";
      seq: number;
      kind: SegKind;
      message?: string;
      ts: number;
    }
  | { t: "turn_start"; turn: number; ts: number }
  | {
      t: "assistant_text";
      turn: number;
      textDelta: string;
      ts: number;
    }
  | {
      t: "tool_call";
      turn: number;
      toolName: string;
      argsPreview: string;
      ts: number;
    }
  | {
      t: "tool_result";
      turn: number;
      toolName: string;
      ok: boolean;
      durationMs: number;
      ts: number;
    }
  | { t: "skill_invoked"; skillName: string; ts: number }
  | {
      t: "usage";
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      costUsd?: number;
      ts: number;
    }
  | {
      t: "message_inject";
      source: "user";
      mode: "individual" | "broadcast";
      text: string;
      ts: number;
    }
  | { t: "message_delivered"; ts: number }
  | { t: "segment_end"; seq: number; ts: number }
  | { t: "run_end"; exitCode: number; ts: number }
  | { t: "error"; message: string; ts: number };

export interface SessionHandle {
  runId: string;
  process: Subprocess;
  sessionId?: string;
  pendingMessages: string[];
}

export interface AdapterSpawnInput {
  runId: string;
  workdir: string;
  initialPrompt: string;
  env: Record<string, string>;
  provider: ProviderConfig;
  model: ModelCard;
  skills: SkillBundle[];
  onEvent: (ev: NormalizedEvent) => void;
}

export interface UsageBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface HarnessAdapter {
  name: "claude_code" | "codex";

  spawn(input: AdapterSpawnInput): Promise<SessionHandle>;

  injectMessage(handle: SessionHandle, text: string): Promise<void>;

  flushQueued?(handle: SessionHandle): Promise<void>;

  interrupt(handle: SessionHandle): Promise<void>;

  close(handle: SessionHandle): Promise<void>;

  estimateCost(usage: UsageBreakdown, model: ModelCard): number | null;
}
