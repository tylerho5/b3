import type { OpenRouterModel } from "../../types/shared";

export interface CatalogFilterState {
  search: string;
  tools: boolean;
  vision: boolean;
  free: boolean;
  anthropicOnly: boolean;
}

export type CatalogSort = "name" | "price" | "context";

export const DEFAULT_FILTERS: CatalogFilterState = {
  search: "",
  tools: false,
  vision: false,
  free: false,
  anthropicOnly: false,
};

export function filterCatalog(
  models: OpenRouterModel[],
  filters: CatalogFilterState,
): OpenRouterModel[] {
  const needle = filters.search.trim().toLowerCase();
  return models.filter((m) => {
    if (needle) {
      const hay = `${m.id} ${m.name}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (filters.tools) {
      if (!m.supported_parameters?.includes("tools")) return false;
    }
    if (filters.vision) {
      const inputs = m.architecture?.input_modalities ?? [];
      if (!inputs.includes("image")) return false;
    }
    if (filters.free) {
      const p = m.pricing;
      const promptZero = !p?.prompt || Number(p.prompt) === 0;
      const compZero = !p?.completion || Number(p.completion) === 0;
      if (!(promptZero && compZero)) return false;
    }
    if (filters.anthropicOnly) {
      if (!m.id.startsWith("anthropic/")) return false;
    }
    return true;
  });
}

export function sortCatalog(
  models: OpenRouterModel[],
  sort: CatalogSort,
): OpenRouterModel[] {
  const out = models.slice();
  if (sort === "name") {
    out.sort((a, b) => a.id.localeCompare(b.id));
  } else if (sort === "price") {
    out.sort((a, b) => priceOf(a) - priceOf(b));
  } else if (sort === "context") {
    out.sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0));
  }
  return out;
}

function priceOf(m: OpenRouterModel): number {
  const p = m.pricing?.prompt;
  if (p == null) return Number.POSITIVE_INFINITY;
  const n = Number(p);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}
