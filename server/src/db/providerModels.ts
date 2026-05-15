import { ulid } from "ulid";
import type { DB } from "./index";
import { resolveCanonicalId } from "../providers/canonicalModel";

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
  canonicalId: string | null;
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
  canonical_id: string | null;
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
    canonicalId: r.canonical_id,
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
      const canonicalId = resolveCanonicalId(db, item.modelId);
      db.run(
        `INSERT INTO provider_models
          (id, provider_id, model_id, display_name, context_length,
           input_cost_per_mtok, output_cost_per_mtok, tier,
           supported_parameters, canonical_id, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          canonicalId,
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

export interface UpdateProviderModelInput {
  displayName?: string;
  tier?: string | null;
  contextLength?: number | null;
  inputCostPerMtok?: number | null;
  outputCostPerMtok?: number | null;
  supportedParameters?: string[] | null;
}

export function updateProviderModel(
  db: DB,
  providerId: string,
  modelId: string,
  patch: UpdateProviderModelInput,
): ProviderModel | null {
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];

  if (patch.displayName !== undefined) {
    sets.push("display_name = ?");
    vals.push(patch.displayName);
  }
  if (patch.tier !== undefined) {
    sets.push("tier = ?");
    vals.push(patch.tier);
  }
  if (patch.contextLength !== undefined) {
    sets.push("context_length = ?");
    vals.push(patch.contextLength);
  }
  if (patch.inputCostPerMtok !== undefined) {
    sets.push("input_cost_per_mtok = ?");
    vals.push(patch.inputCostPerMtok);
  }
  if (patch.outputCostPerMtok !== undefined) {
    sets.push("output_cost_per_mtok = ?");
    vals.push(patch.outputCostPerMtok);
  }
  if (patch.supportedParameters !== undefined) {
    sets.push("supported_parameters = ?");
    vals.push(
      patch.supportedParameters
        ? JSON.stringify(patch.supportedParameters)
        : null,
    );
  }

  if (sets.length === 0) return getProviderModel(db, providerId, modelId);

  vals.push(providerId, modelId);
  const r = db.run(
    `UPDATE provider_models SET ${sets.join(", ")} WHERE provider_id = ? AND model_id = ?`,
    vals,
  );
  if (r.changes === 0) return null;
  return getProviderModel(db, providerId, modelId);
}

export function backfillCanonicalIds(db: DB): number {
  const rows = db
    .query(
      "SELECT id, model_id FROM provider_models WHERE canonical_id IS NULL",
    )
    .all() as { id: string; model_id: string }[];
  let count = 0;
  for (const row of rows) {
    const cid = resolveCanonicalId(db, row.model_id);
    if (cid) {
      db.run("UPDATE provider_models SET canonical_id = ? WHERE id = ?", [
        cid,
        row.id,
      ]);
      count++;
    }
  }
  return count;
}
