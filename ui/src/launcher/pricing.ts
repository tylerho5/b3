import type { ProviderKind } from "../types/shared";

export type PricingMode = "per_token" | "subscription" | "unknown";

export function providerPricingMode(kind: ProviderKind): PricingMode {
  if (kind === "claude_subscription" || kind === "codex_subscription") {
    return "subscription";
  }
  return "per_token";
}
