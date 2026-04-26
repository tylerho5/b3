import { test, expect, beforeEach, afterEach } from "bun:test";
import { fetchOpenRouterCatalog } from "../src/providers/openrouter";

let originalFetch: typeof fetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("fetchOpenRouterCatalog hits /api/v1/models with bearer auth", async () => {
  let calledUrl = "";
  let calledAuth = "";
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calledUrl = String(url);
    calledAuth =
      (init?.headers as Record<string, string> | undefined)?.[
        "Authorization"
      ] ?? "";
    return new Response(
      JSON.stringify({
        data: [
          {
            id: "anthropic/claude-sonnet-4.6",
            name: "Sonnet 4.6",
            context_length: 200000,
            pricing: { prompt: "0.000003", completion: "0.000015" },
            supported_parameters: ["tools"],
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const result = await fetchOpenRouterCatalog("test-key");
  expect(calledUrl).toBe("https://openrouter.ai/api/v1/models");
  expect(calledAuth).toBe("Bearer test-key");
  expect(result.data[0].id).toBe("anthropic/claude-sonnet-4.6");
});

test("fetchOpenRouterCatalog throws on non-2xx", async () => {
  globalThis.fetch = (async () =>
    new Response("nope", { status: 401 })) as typeof fetch;
  await expect(fetchOpenRouterCatalog("bad-key")).rejects.toThrow(/401/);
});
