import type {
  Harness,
  Provider,
  ProviderKind,
  ProviderModel,
} from "../types/shared";

const KIND_HARNESSES: Record<ProviderKind, ReadonlyArray<Harness>> = {
  anthropic_api_direct: ["claude_code"],
  openai_api_direct: ["codex"],
  openrouter: ["claude_code", "codex"],
  claude_subscription: ["claude_code"],
  codex_subscription: ["codex"],
  custom_anthropic_compat: ["claude_code"],
  custom_openai_compat: ["codex"],
};

export interface MatrixCell {
  id: string;
  harness: Harness;
  providerId: string;
  modelId: string;
  warning?: string;
}

export interface ResolveCellsInput {
  harnessSel: Set<Harness>;
  providers: Provider[];
  providerModels: ProviderModel[];
  providerSel: Set<string>;
  modelSel: Set<string>;
}

export function modelSelectionKey(
  providerId: string,
  modelId: string,
): string {
  return `${providerId}::${modelId}`;
}

export function cellId(
  harness: Harness,
  providerId: string,
  modelId: string,
): string {
  return `${harness}::${providerId}::${modelId}`;
}

export function resolveCells({
  harnessSel,
  providers,
  providerModels,
  providerSel,
  modelSel,
}: ResolveCellsInput): MatrixCell[] {
  const providerById = new Map(providers.map((p) => [p.id, p]));
  const cells: MatrixCell[] = [];

  for (const m of providerModels) {
    if (!providerSel.has(m.providerId)) continue;
    if (!modelSel.has(modelSelectionKey(m.providerId, m.modelId))) continue;

    const provider = providerById.get(m.providerId);
    if (!provider) continue;

    const supported = KIND_HARNESSES[provider.kind];
    for (const harness of supported) {
      if (!harnessSel.has(harness)) continue;
      cells.push({
        id: cellId(harness, m.providerId, m.modelId),
        harness,
        providerId: m.providerId,
        modelId: m.modelId,
        warning: cellWarning(provider, harness, m),
      });
    }
  }

  return cells;
}

function cellWarning(
  provider: Provider,
  harness: Harness,
  model: ProviderModel,
): string | undefined {
  if (
    provider.kind === "openrouter" &&
    harness === "claude_code" &&
    !model.modelId.startsWith("anthropic/")
  ) {
    return "Feature gaps under Claude Code (non-Anthropic model via OpenRouter)";
  }
  return undefined;
}
