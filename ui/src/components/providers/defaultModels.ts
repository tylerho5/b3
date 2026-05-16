import type {
  ProviderKind,
  ProviderModelInput,
} from "../../types/shared";

export const DEFAULT_MODELS: Partial<
  Record<ProviderKind, ProviderModelInput[]>
> = {
  anthropic_api_direct: [
    {
      modelId: "claude-opus-4-7",
      displayName: "claude-opus-4-7",
      inputCostPerMtok: 15.0,
      outputCostPerMtok: 75.0,
    },
    {
      modelId: "claude-sonnet-4-6",
      displayName: "claude-sonnet-4-6",
      inputCostPerMtok: 3.0,
      outputCostPerMtok: 15.0,
    },
    {
      modelId: "claude-haiku-4-5",
      displayName: "claude-haiku-4-5",
      inputCostPerMtok: 0.8,
      outputCostPerMtok: 4.0,
    },
  ],
  openai_api_direct: [
    { modelId: "gpt-5.5", displayName: "gpt-5.5" },
    { modelId: "gpt-5.4", displayName: "gpt-5.4" },
    { modelId: "o5-pro", displayName: "o5-pro" },
  ],
};

// Effort axis for subscription harness models. xhigh = "extra high".
export type Effort = "low" | "medium" | "high" | "xhigh";
export const EFFORTS: readonly Effort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export interface SubscriptionModelEntry {
  modelId: string;
  // Excluded from the "reset to recommended defaults" action (e.g. 1m-context
  // variants the user opts into deliberately).
  excludeFromDefaults?: boolean;
}

// Curated catalog for subscription harnesses. No upstream model-list API
// exists for OAuth-keychain auth, so this is bumped manually on releases.
export const SUBSCRIPTION_MODELS: Record<
  "claude_subscription" | "codex_subscription",
  SubscriptionModelEntry[]
> = {
  claude_subscription: [
    { modelId: "claude-opus-4-7" },
    { modelId: "claude-opus-4-7-1m", excludeFromDefaults: true },
    { modelId: "claude-sonnet-4-6" },
    { modelId: "claude-sonnet-4-6-1m", excludeFromDefaults: true },
    { modelId: "claude-haiku-4-5" },
  ],
  codex_subscription: [
    { modelId: "gpt-5.5" },
    { modelId: "gpt-5.4" },
    { modelId: "gpt-5.4-mini" },
    { modelId: "gpt-5.3-codex" },
    { modelId: "gpt-5.2" },
  ],
};
