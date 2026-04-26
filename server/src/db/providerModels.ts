import { ulid } from "ulid";
import type { DB } from "./index";

export interface ProviderModel {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  contextLength: number | null;
  inputCostPerMtok: number | null;
  outputCostPerMtok: number | null;
  tier: string | null;
  supportedParameters: string[] | null;
  addedAt: string;
}

export interface AddProviderModelInput {
  modelId: string;
  displayName: string;
  contextLength?: number | null;
  inputCostPerMtok?: number | null;
  outputCostPerMtok?: number | null;
  tier?: string | null;
  supportedParameters?: string[] | null;
}

interface ProviderModelRow {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  context_length: number | null;
  input_cost_per_mtok: number | null;
  output_cost_per_mtok: number | null;
  tier: string | null;
  supported_parameters: string | null;
  added_at: string;
}

function rowToProviderModel(r: ProviderModelRow): ProviderModel {
  return {
    id: r.id,
    providerId: r.provider_id,
    modelId: r.model_id,
    displayName: r.display_name,
    contextLength: r.context_length,
    inputCostPerMtok: r.input_cost_per_mtok,
    outputCostPerMtok: r.output_cost_per_mtok,
    tier: r.tier,
    supportedParameters: r.supported_parameters
      ? (JSON.parse(r.supported_parameters) as string[])
      : null,
    addedAt: r.added_at,
  };
}

export function addProviderModels(
  db: DB,
  providerId: string,
  inputs: AddProviderModelInput[],
): ProviderModel[] {
  const now = new Date().toISOString();
  const out: ProviderModel[] = [];
  const insert = db.transaction((items: AddProviderModelInput[]) => {
    for (const item of items) {
      const existing = getProviderModel(db, providerId, item.modelId);
      if (existing) {
        out.push(existing);
        continue;
      }
      const id = ulid();
      db.run(
        `INSERT INTO provider_models
          (id, provider_id, model_id, display_name, context_length,
           input_cost_per_mtok, output_cost_per_mtok, tier,
           supported_parameters, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          providerId,
          item.modelId,
          item.displayName,
          item.contextLength ?? null,
          item.inputCostPerMtok ?? null,
          item.outputCostPerMtok ?? null,
          item.tier ?? null,
          item.supportedParameters
            ? JSON.stringify(item.supportedParameters)
            : null,
          now,
        ],
      );
      out.push(getProviderModel(db, providerId, item.modelId)!);
    }
  });
  insert(inputs);
  return out;
}

export function getProviderModel(
  db: DB,
  providerId: string,
  modelId: string,
): ProviderModel | null {
  const row = db
    .query(
      "SELECT * FROM provider_models WHERE provider_id = ? AND model_id = ?",
    )
    .get(providerId, modelId) as ProviderModelRow | undefined;
  return row ? rowToProviderModel(row) : null;
}

export function listProviderModels(
  db: DB,
  providerId: string,
): ProviderModel[] {
  const rows = db
    .query(
      "SELECT * FROM provider_models WHERE provider_id = ? ORDER BY added_at ASC, id ASC",
    )
    .all(providerId) as ProviderModelRow[];
  return rows.map(rowToProviderModel);
}

export function listAllProviderModels(db: DB): ProviderModel[] {
  const rows = db
    .query(
      "SELECT * FROM provider_models ORDER BY provider_id, added_at ASC, id ASC",
    )
    .all() as ProviderModelRow[];
  return rows.map(rowToProviderModel);
}

export function removeProviderModel(
  db: DB,
  providerId: string,
  modelId: string,
): void {
  db.run(
    "DELETE FROM provider_models WHERE provider_id = ? AND model_id = ?",
    [providerId, modelId],
  );
}
