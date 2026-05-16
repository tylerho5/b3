import type { DB } from "./index";

export interface CatalogRow {
  id: string;
  name: string;
  vendor: string;
  contextLength: number | null;
  pricingPrompt: string | null;
  pricingCompletion: string | null;
  supportedParameters: string | null;
  description: string | null;
  fetchedAt: number;
}

export interface CatalogRowInput {
  id: string;
  name: string;
  contextLength: number | null;
  pricingPrompt: string | null;
  pricingCompletion: string | null;
  supportedParameters: string | null;
  description: string | null;
  fetchedAt: number;
}

interface CatalogSqlRow {
  id: string;
  name: string;
  vendor: string;
  context_length: number | null;
  pricing_prompt: string | null;
  pricing_completion: string | null;
  supported_parameters: string | null;
  description: string | null;
  fetched_at: number;
}

function rowToCatalog(r: CatalogSqlRow): CatalogRow {
  return {
    id: r.id,
    name: r.name,
    vendor: r.vendor,
    contextLength: r.context_length,
    pricingPrompt: r.pricing_prompt,
    pricingCompletion: r.pricing_completion,
    supportedParameters: r.supported_parameters,
    description: r.description,
    fetchedAt: r.fetched_at,
  };
}

export function upsertCatalogRow(db: DB, input: CatalogRowInput): void {
  const slash = input.id.indexOf("/");
  const vendor = slash >= 0 ? input.id.slice(0, slash) : "";
  db.run(
    `INSERT OR REPLACE INTO openrouter_catalog
      (id, name, vendor, context_length, pricing_prompt, pricing_completion,
       supported_parameters, description, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.name,
      vendor,
      input.contextLength,
      input.pricingPrompt,
      input.pricingCompletion,
      input.supportedParameters,
      input.description,
      input.fetchedAt,
    ],
  );
}

export function listCatalog(db: DB): CatalogRow[] {
  const rows = db
    .query("SELECT * FROM openrouter_catalog ORDER BY id")
    .all() as CatalogSqlRow[];
  return rows.map(rowToCatalog);
}

export function getCatalogById(db: DB, id: string): CatalogRow | null {
  const row = db
    .query("SELECT * FROM openrouter_catalog WHERE id = ?")
    .get(id) as CatalogSqlRow | undefined;
  return row ? rowToCatalog(row) : null;
}

export function findByVendor(db: DB, vendor: string): CatalogRow[] {
  const rows = db
    .query("SELECT * FROM openrouter_catalog WHERE vendor = ? ORDER BY id")
    .all(vendor) as CatalogSqlRow[];
  return rows.map(rowToCatalog);
}
