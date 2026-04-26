import type { Provider } from "../types/shared";

export function routeLabel(provider: Provider): string {
  switch (provider.kind) {
    case "claude_subscription":
    case "codex_subscription":
      return "sub";
    case "openrouter":
      return "or";
    case "anthropic_api_direct":
    case "openai_api_direct":
      return "api";
    default:
      // Use shortened provider name for custom kinds
      return provider.name.replace(/\s+/g, "").slice(0, 8).toLowerCase();
  }
}
