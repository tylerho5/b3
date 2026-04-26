import type { Harness, Provider, ProviderKind } from "../db/providers";
import type { ProviderModel } from "../db/providerModels";
import { PROVIDER_KIND_META } from "./kinds";

export interface ResolveRouteInput {
  modelName: string;
  harness: Harness;
  providers: Provider[];
  providerModels: ProviderModel[];
  pins: Record<string, string>;
}

type RouteTier = "subscription" | "openrouter" | "per_token";

function routeTier(kind: ProviderKind): RouteTier {
  if (kind === "claude_subscription" || kind === "codex_subscription") {
    return "subscription";
  }
  if (kind === "openrouter") return "openrouter";
  return "per_token";
}

function supportsHarness(kind: ProviderKind, harness: Harness): boolean {
  return PROVIDER_KIND_META[kind].supportedHarnesses.includes(harness);
}

export function resolveRoute({
  modelName,
  harness,
  providers,
  providerModels,
  pins,
}: ResolveRouteInput): string | null {
  // Build a set of providerIds that carry modelName
  const modelProviderIds = new Set(
    providerModels
      .filter((m) => m.modelId === modelName)
      .map((m) => m.providerId),
  );

  const eligible = providers.filter(
    (p) =>
      modelProviderIds.has(p.id) && supportsHarness(p.kind, harness),
  );

  if (eligible.length === 0) return null;

  // Priority 1: pinned provider
  const pinnedId = pins[modelName];
  if (pinnedId) {
    const pinned = eligible.find((p) => p.id === pinnedId);
    if (pinned) return pinned.id;
    // pin points to a provider that doesn't support this harness — fall through
  }

  // Priority 2–4: subscription > openrouter > per_token; alphabetical within tier
  const TIER_ORDER: RouteTier[] = ["subscription", "openrouter", "per_token"];
  for (const tier of TIER_ORDER) {
    const candidates = eligible
      .filter((p) => routeTier(p.kind) === tier)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (candidates.length > 0) return candidates[0].id;
  }

  return null;
}
