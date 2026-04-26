import type { Harness, Provider } from "../db/providers";
import type { ProviderModel } from "../db/providerModels";
import { PROVIDER_KIND_META } from "./kinds";

export type SpawnEnv = Record<string, string>;

const OPENROUTER_BASE_ANTHROPIC = "https://openrouter.ai/api";
const OPENROUTER_BASE_OPENAI = "https://openrouter.ai/api/v1";

export function buildSpawnEnv(
  provider: Provider,
  model: ProviderModel,
  harness: Harness,
): SpawnEnv {
  const meta = PROVIDER_KIND_META[provider.kind];
  if (!meta.supportedHarnesses.includes(harness)) {
    throw new Error(
      `provider kind ${provider.kind} does not support harness ${harness}`,
    );
  }

  if (provider.kind === "claude_subscription") {
    const env: SpawnEnv = {};
    applyModelEnv(env, model);
    return env;
  }
  if (provider.kind === "codex_subscription") {
    return {};
  }

  const key = resolveCredential(provider);

  if (harness === "claude_code") {
    return buildAnthropicShapedEnv(provider, model, key);
  }
  return buildOpenAIShapedEnv(provider, key);
}

function resolveCredential(provider: Provider): string {
  if (provider.apiKey != null && provider.apiKey !== "") {
    return provider.apiKey;
  }
  if (provider.apiKeyEnvRef) {
    const v = process.env[provider.apiKeyEnvRef];
    if (!v) {
      throw new Error(
        `provider ${provider.name} references env var ${provider.apiKeyEnvRef} but it is not set in the server environment`,
      );
    }
    return v;
  }
  throw new Error(`provider ${provider.name} has no credentials configured`);
}

function buildAnthropicShapedEnv(
  provider: Provider,
  model: ProviderModel,
  key: string,
): SpawnEnv {
  const env: SpawnEnv = {};
  switch (provider.kind) {
    case "anthropic_api_direct":
      env.ANTHROPIC_API_KEY = key;
      break;
    case "openrouter":
      env.ANTHROPIC_BASE_URL = OPENROUTER_BASE_ANTHROPIC;
      env.ANTHROPIC_AUTH_TOKEN = key;
      env.ANTHROPIC_API_KEY = "";
      break;
    case "custom_anthropic_compat":
      if (!provider.baseUrl) {
        throw new Error(
          `${provider.name}: custom_anthropic_compat requires baseUrl`,
        );
      }
      env.ANTHROPIC_BASE_URL = provider.baseUrl;
      env.ANTHROPIC_AUTH_TOKEN = key;
      env.ANTHROPIC_API_KEY = "";
      break;
    default:
      throw new Error(
        `buildAnthropicShapedEnv called with non-Anthropic kind ${provider.kind}`,
      );
  }
  applyModelEnv(env, model);
  return env;
}

function buildOpenAIShapedEnv(provider: Provider, key: string): SpawnEnv {
  const env: SpawnEnv = {};
  switch (provider.kind) {
    case "openai_api_direct":
      env.OPENAI_API_KEY = key;
      break;
    case "openrouter":
      env.OPENAI_BASE_URL = OPENROUTER_BASE_OPENAI;
      env.OPENAI_API_KEY = key;
      break;
    case "custom_openai_compat":
      if (!provider.baseUrl) {
        throw new Error(
          `${provider.name}: custom_openai_compat requires baseUrl`,
        );
      }
      env.OPENAI_BASE_URL = provider.baseUrl;
      env.OPENAI_API_KEY = key;
      break;
    default:
      throw new Error(
        `buildOpenAIShapedEnv called with non-OpenAI kind ${provider.kind}`,
      );
  }
  return env;
}

function applyModelEnv(env: SpawnEnv, model: ProviderModel): void {
  // Subagents spawn through tier-keyed env vars; setting all three to the
  // same id when tier is unset keeps subagents on the model under test.
  if (model.tier === "opus") {
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = model.modelId;
  } else if (model.tier === "sonnet") {
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = model.modelId;
  } else if (model.tier === "haiku") {
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model.modelId;
  } else {
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = model.modelId;
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = model.modelId;
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model.modelId;
  }
}
