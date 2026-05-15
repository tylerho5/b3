import { fetchOpenRouterCatalog } from "./openrouter";
import type { OpenRouterCatalog } from "./openrouter";
import { upsertCatalogRow } from "../db/openrouterCatalog";
import { backfillCanonicalIds } from "../db/providerModels";
import type { DB } from "../db";

export interface RefreshOpts {
  catalogOverride?: OpenRouterCatalog | null;
}

export async function refreshCatalog(
  db: DB,
  opts: RefreshOpts = {},
): Promise<void> {
  try {
    const cat =
      opts.catalogOverride !== undefined
        ? opts.catalogOverride
        : await fetchOpenRouterCatalog(null);
    if (!cat) return;
    const now = Date.now();
    for (const m of cat.data) {
      upsertCatalogRow(db, {
        id: m.id,
        name: m.name,
        contextLength: m.context_length ?? null,
        pricingPrompt: m.pricing?.prompt ?? null,
        pricingCompletion: m.pricing?.completion ?? null,
        supportedParameters: m.supported_parameters
          ? JSON.stringify(m.supported_parameters)
          : null,
        description: m.description ?? null,
        fetchedAt: now,
      });
    }
    backfillCanonicalIds(db);
  } catch (e) {
    console.warn(
      `[b3] openrouter catalog refresh failed: ${(e as Error).message}`,
    );
  }
}

export function kickoffBackgroundRefresh(db: DB): void {
  void refreshCatalog(db);
}
