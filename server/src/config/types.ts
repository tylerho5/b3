export type PricingMode = "per_token" | "subscription" | "unknown";

export type Harness = "claude_code" | "codex";

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

export interface JudgeConfig {
  template: string;
}

export interface B3Config {
  version: number;
  judge: JudgeConfig;
  providers: ProviderConfig[];
}
