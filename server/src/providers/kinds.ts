import type { Harness, ProviderKind } from "../db/providers";

export interface ProviderKindMeta {
  supportedHarnesses: Harness[];
  requiresBaseUrl: boolean;
  requiresCredentials: boolean;
}

export const PROVIDER_KIND_META: Record<ProviderKind, ProviderKindMeta> = {
  anthropic_api_direct: {
    supportedHarnesses: ["claude_code"],
    requiresBaseUrl: false,
    requiresCredentials: true,
  },
  openai_api_direct: {
    supportedHarnesses: ["codex"],
    requiresBaseUrl: false,
    requiresCredentials: true,
  },
  openrouter: {
    supportedHarnesses: ["claude_code", "codex"],
    requiresBaseUrl: false,
    requiresCredentials: true,
  },
  claude_subscription: {
    supportedHarnesses: ["claude_code"],
    requiresBaseUrl: false,
    requiresCredentials: false,
  },
  codex_subscription: {
    supportedHarnesses: ["codex"],
    requiresBaseUrl: false,
    requiresCredentials: false,
  },
  custom_anthropic_compat: {
    supportedHarnesses: ["claude_code"],
    requiresBaseUrl: true,
    requiresCredentials: true,
  },
  custom_openai_compat: {
    supportedHarnesses: ["codex"],
    requiresBaseUrl: true,
    requiresCredentials: true,
  },
};

export function supportedHarnesses(kind: ProviderKind): Harness[] {
  return PROVIDER_KIND_META[kind].supportedHarnesses;
}

export function requiresBaseUrl(kind: ProviderKind): boolean {
  return PROVIDER_KIND_META[kind].requiresBaseUrl;
}

export function requiresCredentials(kind: ProviderKind): boolean {
  return PROVIDER_KIND_META[kind].requiresCredentials;
}
