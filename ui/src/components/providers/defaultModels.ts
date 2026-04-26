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
      displayName: "Claude Opus 4.7",
      tier: "opus",
      inputCostPerMtok: 15.0,
      outputCostPerMtok: 75.0,
    },
    {
      modelId: "claude-sonnet-4-6",
      displayName: "Claude Sonnet 4.6",
      tier: "sonnet",
      inputCostPerMtok: 3.0,
      outputCostPerMtok: 15.0,
    },
    {
      modelId: "claude-haiku-4-5",
      displayName: "Claude Haiku 4.5",
      tier: "haiku",
      inputCostPerMtok: 0.8,
      outputCostPerMtok: 4.0,
    },
  ],
  openai_api_direct: [
    { modelId: "gpt-5.5", displayName: "GPT 5.5" },
    { modelId: "gpt-5.4", displayName: "GPT 5.4" },
    { modelId: "o5-pro", displayName: "o5-pro" },
  ],
};
