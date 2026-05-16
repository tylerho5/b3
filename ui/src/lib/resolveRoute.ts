import type { Harness, Provider, ProviderKind, ProviderModel } from "../types/shared";
import { parseModelKey } from "./modelKey";

type RouteTier = "subscription" | "openrouter" | "per_token";

function routeTier(kind: ProviderKind): RouteTier {
  if (kind === "claude_subscription" || kind === "codex_subscription") return "subscription";
  if (kind === "openrouter") return "openrouter";
  return "per_token";
}

const KIND_HARNESSES: Record<ProviderKind, ReadonlyArray<Harness>> = {
  anthropic_api_direct: ["claude_code"],
  openai_api_direct: ["codex"],
  openrouter: ["claude_code", "codex"],
  claude_subscription: ["claude_code"],
  codex_subscription: ["codex"],
  custom_anthropic_compat: ["claude_code"],
  custom_openai_compat: ["codex"],
};

export interface ResolveRouteInput {
  modelName: string;
  effort?: string;
  harness: Harness;
  providers: Provider[];
  providerModels: ProviderModel[];
  pins: Record<string, Partial<Record<Harness, string>>>;
}

export function resolveRoute({
  modelName,
  effort,
  harness,
  providers,
  providerModels,
  pins,
}: ResolveRouteInput): string | null {
  const modelProviderIds = new Set(
    providerModels
      .filter((m) => m.modelId === modelName && (effort === undefined || m.effort === effort))
      .map((m) => m.providerId),
  );

  const eligible = providers.filter(
    (p) => modelProviderIds.has(p.id) && KIND_HARNESSES[p.kind].includes(harness),
  );

  if (eligible.length === 0) return null;

  const effortKey = effort ? `${modelName}::${effort}` : null;
  const pinnedId = (effortKey ? pins[effortKey]?.[harness] : undefined) ?? pins[modelName]?.[harness];
  if (pinnedId) {
    const pinned = eligible.find((p) => p.id === pinnedId);
    if (pinned) return pinned.id;
  }

  const TIER_ORDER: RouteTier[] = ["subscription", "openrouter", "per_token"];
  for (const tier of TIER_ORDER) {
    const candidates = eligible
      .filter((p) => routeTier(p.kind) === tier)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (candidates.length > 0) return candidates[0].id;
  }

  return null;
}

export function nativeHarnessesForModel(
  modelKey: string,
  providers: Provider[],
  providerModels: ProviderModel[],
): Harness[] {
  const { modelId, effort } = parseModelKey(modelKey);
  const modelProviderIds = new Set(
    providerModels
      .filter((m) => m.modelId === modelId && (effort === "" || m.effort === effort))
      .map((m) => m.providerId),
  );
  const harnesses = new Set<Harness>();
  for (const p of providers) {
    if (!modelProviderIds.has(p.id)) continue;
    for (const h of KIND_HARNESSES[p.kind]) harnesses.add(h);
  }
  return Array.from(harnesses);
}
