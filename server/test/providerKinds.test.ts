import { test, expect } from "bun:test";
import {
  PROVIDER_KIND_META,
  supportedHarnesses,
  requiresBaseUrl,
  requiresCredentials,
} from "../src/providers/kinds";

test("openrouter supports both harnesses", () => {
  expect([...supportedHarnesses("openrouter")].sort()).toEqual([
    "claude_code",
    "codex",
  ]);
});

test("anthropic_api_direct is claude_code only", () => {
  expect(supportedHarnesses("anthropic_api_direct")).toEqual(["claude_code"]);
});

test("subscription kinds require no credentials and no base url", () => {
  expect(requiresCredentials("claude_subscription")).toBe(false);
  expect(requiresCredentials("codex_subscription")).toBe(false);
  expect(requiresBaseUrl("claude_subscription")).toBe(false);
});

test("custom kinds require base url", () => {
  expect(requiresBaseUrl("custom_anthropic_compat")).toBe(true);
  expect(requiresBaseUrl("custom_openai_compat")).toBe(true);
});

test("PROVIDER_KIND_META is exhaustive over all kinds", () => {
  const allKinds = [
    "anthropic_api_direct",
    "openai_api_direct",
    "openrouter",
    "claude_subscription",
    "codex_subscription",
    "custom_anthropic_compat",
    "custom_openai_compat",
  ] as const;
  for (const k of allKinds) {
    expect(PROVIDER_KIND_META[k]).toBeDefined();
  }
});
