// Mirrors server types — kept in sync by hand for v1. (Could be generated later.)

export type Harness = "claude_code" | "codex";
export type PricingMode = "per_token" | "subscription" | "unknown";

export interface ModelCard {
  id: string;
  tier?: "haiku" | "sonnet" | "opus";
  inputCostPerMtok?: number;
  outputCostPerMtok?: number;
}

export interface ProviderConfig {
  harness: Harness;
  id: string;
  label: string;
  pricingMode: PricingMode;
  env: Record<string, string>;
  codexProfile?: string;
  models: ModelCard[];
}

export type ProviderKind =
  | "anthropic_api_direct"
  | "openai_api_direct"
  | "openrouter"
  | "claude_subscription"
  | "codex_subscription"
  | "custom_anthropic_compat"
  | "custom_openai_compat";

export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string | null;
  apiKey: string | null;
  apiKeyEnvRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderModel {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  contextLength: number | null;
  inputCostPerMtok: number | null;
  outputCostPerMtok: number | null;
  tier: string | null;
  supportedParameters: string[] | null;
  addedAt: string;
}

export interface ProviderModelInput {
  modelId: string;
  displayName: string;
  contextLength?: number | null;
  inputCostPerMtok?: number | null;
  outputCostPerMtok?: number | null;
  tier?: string | null;
  supportedParameters?: string[] | null;
}

export interface CreateProviderInput {
  name: string;
  kind: ProviderKind;
  baseUrl?: string | null;
  apiKey?: string | null;
  apiKeyEnvRef?: string | null;
}

export interface UpdateProviderInput {
  name?: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  apiKeyEnvRef?: string | null;
}

export interface ProviderProbeResult {
  ok: boolean;
  message: string;
  modelCount?: number;
  authenticated?: boolean;
  installed?: boolean;
  version?: string;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number | null;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  supported_parameters?: string[];
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
}

export interface OpenRouterCatalog {
  data: OpenRouterModel[];
}

export interface SubscriptionStatus {
  installed: boolean;
  authenticated: boolean;
  version?: string;
  details?: string;
}

export interface Task {
  id: string;
  name: string;
  prompt: string;
  baseRepo: string | null;
  baseCommit: string | null;
  testCommand: string | null;
  timeBudgetS: number;
  judgeEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  name: string;
  prompt: string;
  baseRepo?: string | null;
  baseCommit?: string | null;
  testCommand?: string | null;
  timeBudgetS?: number;
  judgeEnabled?: boolean;
}

export interface RefinedTask {
  name: string;
  prompt: string;
  test_command: string;
  base_repo_setup: string;
  notes: string;
}

export interface SkillBundle {
  id: string;
  name: string;
  description: string;
  source: "user_claude" | "plugin" | "user_codex" | "user_agents";
  sourceLabel: string;
  path: string;
  pluginName?: string;
  pluginVersion?: string;
}

export type RunStatus =
  | "pending"
  | "running"
  | "testing"
  | "passed"
  | "failed"
  | "error"
  | "canceled";

export type MatrixRunStatus = "running" | "completed" | "canceled";

export interface MatrixEstimate {
  cellsWithHistory: number;
  medianMs: number;
}

export interface MatrixRun {
  id: string;
  taskId: string;
  skillIds: string[];
  concurrency: number;
  startedAt: string;
  completedAt: string | null;
  status: MatrixRunStatus;
}

export interface Run {
  id: string;
  matrixRunId: string;
  harness: Harness;
  providerId: string;
  modelId: string;
  worktreePath: string;
  sessionId: string | null;
  status: RunStatus;
  startedAt: string | null;
  completedAt: string | null;
  exitCode: number | null;
  testsPassed: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  turns: number;
  judgeScore: number | null;
  judgeNotes: string | null;
}

export type SegKind = "initial" | "followup" | "broadcast";
export interface RunSegment {
  id: number;
  runId: string;
  seq: number;
  kind: SegKind;
  message: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

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
  | { t: "assistant_text"; turn: number; textDelta: string; ts: number }
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

export interface WSEnvelope {
  matrixRunId: string;
  runId: string;
  event: NormalizedEvent;
}
