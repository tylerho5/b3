import { ulid } from "ulid";
import type { DB } from "./index";

export type Harness = "claude_code" | "codex";

export type ProviderKind =
  | "anthropic_api_direct"
  | "openai_api_direct"
  | "openrouter"
  | "claude_subscription"
  | "codex_subscription"
  | "custom_anthropic_compat"
  | "custom_openai_compat";

const VALID_KINDS: readonly ProviderKind[] = [
  "anthropic_api_direct",
  "openai_api_direct",
  "openrouter",
  "claude_subscription",
  "codex_subscription",
  "custom_anthropic_compat",
  "custom_openai_compat",
];

export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string | null;
  apiKey: string | null;
  apiKeyEnvRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProviderInput {
  name: string;
  kind: ProviderKind;
  baseUrl?: string | null;
  apiKey?: string | null;
  apiKeyEnvRef?: string | null;
}

export interface UpdateProviderInput {
  name?: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  apiKeyEnvRef?: string | null;
}

interface ProviderRow {
  id: string;
  name: string;
  kind: string;
  base_url: string | null;
  api_key: string | null;
  api_key_env_ref: string | null;
  created_at: string;
  updated_at: string;
}

function rowToProvider(r: ProviderRow): Provider {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as ProviderKind,
    baseUrl: r.base_url,
    apiKey: r.api_key,
    apiKeyEnvRef: r.api_key_env_ref,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function createProvider(
  db: DB,
  input: CreateProviderInput,
): Provider {
  if (!VALID_KINDS.includes(input.kind)) {
    throw new Error(`invalid provider kind: ${input.kind}`);
  }
  const id = ulid();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO providers (id, name, kind, base_url, api_key, api_key_env_ref, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.kind,
      input.baseUrl ?? null,
      input.apiKey ?? null,
      input.apiKeyEnvRef ?? null,
      now,
      now,
    ],
  );
  return getProvider(db, id)!;
}

export function getProvider(db: DB, id: string): Provider | null {
  const row = db
    .query("SELECT * FROM providers WHERE id = ?")
    .get(id) as ProviderRow | undefined;
  return row ? rowToProvider(row) : null;
}

export function listProviders(db: DB): Provider[] {
  const rows = db
    .query("SELECT * FROM providers ORDER BY created_at ASC, id ASC")
    .all() as ProviderRow[];
  return rows.map(rowToProvider);
}

export function updateProvider(
  db: DB,
  id: string,
  patch: UpdateProviderInput,
): Provider {
  const existing = getProvider(db, id);
  if (!existing) throw new Error(`provider not found: ${id}`);
  const merged: Provider = {
    ...existing,
    name: patch.name ?? existing.name,
    baseUrl: patch.baseUrl !== undefined ? patch.baseUrl : existing.baseUrl,
    apiKey: patch.apiKey !== undefined ? patch.apiKey : existing.apiKey,
    apiKeyEnvRef:
      patch.apiKeyEnvRef !== undefined
        ? patch.apiKeyEnvRef
        : existing.apiKeyEnvRef,
    updatedAt: new Date().toISOString(),
  };
  db.run(
    `UPDATE providers
       SET name = ?, base_url = ?, api_key = ?, api_key_env_ref = ?, updated_at = ?
     WHERE id = ?`,
    [
      merged.name,
      merged.baseUrl,
      merged.apiKey,
      merged.apiKeyEnvRef,
      merged.updatedAt,
      id,
    ],
  );
  return merged;
}

export function deleteProvider(db: DB, id: string): void {
  db.run("DELETE FROM providers WHERE id = ?", [id]);
}
