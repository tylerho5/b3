import TOML from "@iarna/toml";
import type { DB } from "../db";
import type { Harness } from "../config/types";
import {
  createProvider,
  deleteProvider,
  listProviders,
  type Provider,
  type ProviderKind,
} from "../db/providers";
import {
  addProviderModels,
  listProviderModels,
  type AddProviderModelInput,
  type ProviderModel,
} from "../db/providerModels";
import { getSetting, putSetting } from "../db/appSettings";
import { supportedHarnesses } from "./kinds";

const ENV_REF_RE = /^\$\{([A-Z_][A-Z0-9_]*)\}$/;

export interface SerializeInput {
  providers: Provider[];
  modelsByProvider: Map<string, ProviderModel[]>;
  judgeTemplate: string | null;
}

export function serializeToToml(input: SerializeInput): string {
  type RawProvider = Record<string, unknown>;
  const claude_code: RawProvider[] = [];
  const codex: RawProvider[] = [];
  for (const p of input.providers) {
    const models = input.modelsByProvider.get(p.id) ?? [];
    for (const harness of supportedHarnesses(p.kind)) {
      const block = providerToTomlBlock(p, models, harness);
      if (harness === "claude_code") claude_code.push(block);
      else codex.push(block);
    }
  }
  const obj: Record<string, unknown> = {
    version: 1,
    judge: { template: input.judgeTemplate ?? "" },
    providers: {
      ...(claude_code.length > 0 ? { claude_code } : {}),
      ...(codex.length > 0 ? { codex } : {}),
    },
  };
  return TOML.stringify(obj as unknown as TOML.JsonMap);
}

function providerToTomlBlock(
  p: Provider,
  models: ProviderModel[],
  harness: Harness,
): Record<string, unknown> {
  const env = buildEnvBlock(p, harness);
  const block: Record<string, unknown> = {
    id: p.id,
    label: p.name,
    pricing_mode: pricingModeFor(p.kind),
  };
  if (Object.keys(env).length > 0) block.env = env;
  block.models = models.map(modelToTomlEntry);
  return block;
}

function pricingModeFor(kind: ProviderKind): string {
  if (kind === "claude_subscription" || kind === "codex_subscription") {
    return "subscription";
  }
  return "per_token";
}

function buildEnvBlock(
  p: Provider,
  harness: Harness,
): Record<string, string> {
  const credValue = p.apiKey ?? (p.apiKeyEnvRef ? `\${${p.apiKeyEnvRef}}` : null);
  const env: Record<string, string> = {};
  switch (p.kind) {
    case "anthropic_api_direct":
      if (credValue) env.ANTHROPIC_API_KEY = credValue;
      break;
    case "openai_api_direct":
      if (credValue) env.OPENAI_API_KEY = credValue;
      break;
    case "openrouter":
      if (harness === "claude_code") {
        env.ANTHROPIC_BASE_URL = "https://openrouter.ai/api";
        if (credValue) env.ANTHROPIC_AUTH_TOKEN = credValue;
      } else {
        env.OPENAI_BASE_URL = "https://openrouter.ai/api/v1";
        if (credValue) env.OPENAI_API_KEY = credValue;
      }
      break;
    case "custom_anthropic_compat":
      if (p.baseUrl) env.ANTHROPIC_BASE_URL = p.baseUrl;
      if (credValue) env.ANTHROPIC_AUTH_TOKEN = credValue;
      break;
    case "custom_openai_compat":
      if (p.baseUrl) env.OPENAI_BASE_URL = p.baseUrl;
      if (credValue) env.OPENAI_API_KEY = credValue;
      break;
    case "claude_subscription":
    case "codex_subscription":
      // intentionally empty
      break;
  }
  return env;
}

function modelToTomlEntry(m: ProviderModel): Record<string, unknown> {
  const out: Record<string, unknown> = { id: m.modelId };
  if (m.tier) out.tier = m.tier;
  if (m.inputCostPerMtok != null) out.input_cost_per_mtok = m.inputCostPerMtok;
  if (m.outputCostPerMtok != null) out.output_cost_per_mtok = m.outputCostPerMtok;
  return out;
}

interface RawModelEntry {
  id?: string;
  tier?: string;
  input_cost_per_mtok?: number;
  output_cost_per_mtok?: number;
}

interface RawProviderEntry {
  id?: string;
  label?: string;
  pricing_mode?: string;
  env?: Record<string, string>;
  codex_profile?: string;
  models?: RawModelEntry[];
}

interface RawTomlConfig {
  version?: number;
  judge?: { template?: string };
  providers?: {
    claude_code?: RawProviderEntry[];
    codex?: RawProviderEntry[];
  };
}

export function parseTomlPayload(toml: string): RawTomlConfig {
  return TOML.parse(toml) as unknown as RawTomlConfig;
}

interface ImportPlan {
  providers: Array<{
    legacyId: string;
    name: string;
    kind: ProviderKind;
    baseUrl: string | null;
    apiKey: string | null;
    apiKeyEnvRef: string | null;
    models: AddProviderModelInput[];
  }>;
  judgeTemplate: string | null;
}

export function buildImportPlan(parsed: RawTomlConfig): ImportPlan {
  const plan: ImportPlan = {
    providers: [],
    judgeTemplate: parsed.judge?.template ?? null,
  };
  const harnessEntries: Array<[Harness, RawProviderEntry[]]> = [
    ["claude_code", parsed.providers?.claude_code ?? []],
    ["codex", parsed.providers?.codex ?? []],
  ];
  // Coalesce openrouter-* entries (one per harness in legacy TOML, one
  // logical provider in the new schema).
  let pendingOpenrouter:
    | {
        legacyId: string;
        name: string;
        baseUrl: string | null;
        apiKey: string | null;
        apiKeyEnvRef: string | null;
        models: AddProviderModelInput[];
      }
    | null = null;

  for (const [harness, entries] of harnessEntries) {
    for (const entry of entries) {
      const env = entry.env ?? {};
      const kind = inferKindFromLegacyEntry(harness, env);
      const cred = extractCredential(harness, env, kind);
      const baseUrl = harness === "claude_code"
        ? (env.ANTHROPIC_BASE_URL ?? null)
        : (env.OPENAI_BASE_URL ?? null);
      const models: AddProviderModelInput[] = (entry.models ?? []).map(
        (m) => ({
          modelId: String(m.id ?? ""),
          displayName: String(m.id ?? ""),
          tier: m.tier ?? null,
          inputCostPerMtok: m.input_cost_per_mtok ?? null,
          outputCostPerMtok: m.output_cost_per_mtok ?? null,
        }),
      ).filter((m) => m.modelId);

      if (kind === "openrouter") {
        if (!pendingOpenrouter) {
          pendingOpenrouter = {
            legacyId: entry.id ?? "openrouter",
            name: "OpenRouter",
            baseUrl: null,
            apiKey: cred.apiKey,
            apiKeyEnvRef: cred.apiKeyEnvRef,
            models,
          };
        } else {
          // Merge: keep existing key, dedupe models by id
          const seen = new Set(pendingOpenrouter.models.map((m) => m.modelId));
          for (const m of models) {
            if (!seen.has(m.modelId)) {
              pendingOpenrouter.models.push(m);
              seen.add(m.modelId);
            }
          }
        }
        continue;
      }

      plan.providers.push({
        legacyId: entry.id ?? "",
        name: entry.label ?? entry.id ?? "(unnamed)",
        kind,
        baseUrl: kind.startsWith("custom_") ? baseUrl : null,
        apiKey: cred.apiKey,
        apiKeyEnvRef: cred.apiKeyEnvRef,
        models,
      });
    }
  }

  if (pendingOpenrouter) {
    plan.providers.push({
      legacyId: pendingOpenrouter.legacyId,
      name: pendingOpenrouter.name,
      kind: "openrouter",
      baseUrl: null,
      apiKey: pendingOpenrouter.apiKey,
      apiKeyEnvRef: pendingOpenrouter.apiKeyEnvRef,
      models: pendingOpenrouter.models,
    });
  }

  return plan;
}

function inferKindFromLegacyEntry(
  harness: Harness,
  env: Record<string, string>,
): ProviderKind {
  if (harness === "claude_code") {
    const baseUrl = env.ANTHROPIC_BASE_URL;
    const hasAuth = !!env.ANTHROPIC_AUTH_TOKEN || !!env.ANTHROPIC_API_KEY;
    if (!baseUrl && !hasAuth) return "claude_subscription";
    if (baseUrl && baseUrl.includes("openrouter.ai")) return "openrouter";
    if (baseUrl) return "custom_anthropic_compat";
    return "anthropic_api_direct";
  }
  const baseUrl = env.OPENAI_BASE_URL;
  const hasKey = !!env.OPENAI_API_KEY;
  if (!baseUrl && !hasKey) return "codex_subscription";
  if (baseUrl && baseUrl.includes("openrouter.ai")) return "openrouter";
  if (baseUrl) return "custom_openai_compat";
  return "openai_api_direct";
}

function extractCredential(
  harness: Harness,
  env: Record<string, string>,
  kind: ProviderKind,
): { apiKey: string | null; apiKeyEnvRef: string | null } {
  if (kind === "claude_subscription" || kind === "codex_subscription") {
    return { apiKey: null, apiKeyEnvRef: null };
  }
  const candidate = harness === "claude_code"
    ? (env.ANTHROPIC_AUTH_TOKEN ?? env.ANTHROPIC_API_KEY ?? null)
    : (env.OPENAI_API_KEY ?? null);
  if (!candidate) return { apiKey: null, apiKeyEnvRef: null };
  const m = candidate.match(ENV_REF_RE);
  if (m) return { apiKey: null, apiKeyEnvRef: m[1] };
  return { apiKey: candidate, apiKeyEnvRef: null };
}

export interface ApplyOptions {
  replace?: boolean;
}

export function applyImportPlan(
  db: DB,
  plan: ImportPlan,
  opts: ApplyOptions = {},
): { providersAdded: number; modelsAdded: number } {
  const tx = db.transaction(() => {
    if (opts.replace) {
      for (const existing of listProviders(db)) {
        deleteProvider(db, existing.id);
      }
    }
    let providersAdded = 0;
    let modelsAdded = 0;
    for (const p of plan.providers) {
      const created = createProvider(db, {
        name: p.name,
        kind: p.kind,
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        apiKeyEnvRef: p.apiKeyEnvRef,
      });
      providersAdded++;
      if (p.models.length > 0) {
        const added = addProviderModels(db, created.id, p.models);
        modelsAdded += added.length;
      }
    }
    if (plan.judgeTemplate != null) {
      putSetting(db, "judge_template", plan.judgeTemplate);
    }
    return { providersAdded, modelsAdded };
  });
  return tx();
}

export function snapshotForExport(db: DB): SerializeInput {
  const providers = listProviders(db);
  const modelsByProvider = new Map<string, ProviderModel[]>();
  for (const p of providers) {
    modelsByProvider.set(p.id, listProviderModels(db, p.id));
  }
  return {
    providers,
    modelsByProvider,
    judgeTemplate: getSetting(db, "judge_template"),
  };
}
