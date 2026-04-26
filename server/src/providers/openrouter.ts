export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number | null;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  supported_parameters?: string[];
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
}

export interface OpenRouterCatalog {
  data: OpenRouterModel[];
}

export async function fetchOpenRouterCatalog(
  apiKey: string,
): Promise<OpenRouterCatalog> {
  const r = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) {
    throw new Error(
      `OpenRouter catalog fetch failed: ${r.status} ${r.statusText}`,
    );
  }
  return (await r.json()) as OpenRouterCatalog;
}
