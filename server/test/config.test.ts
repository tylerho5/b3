import { test, expect } from "bun:test";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config/load";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, "fixtures/sample.toml");

test("loadConfig returns a valid B3Config with 3 providers", () => {
  const cfg = loadConfig(FIXTURE, {
    ANTHROPIC_API_KEY: "sk-anth",
    ALIBABA_CLAUDE_CODE_API_KEY: "ali-token",
  });
  expect(cfg.version).toBe(1);
  expect(cfg.judge.template).toBe("score the run");
  expect(cfg.providers).toHaveLength(3);
});

test("env interpolation resolves ${VAR} from fakeEnv", () => {
  const cfg = loadConfig(FIXTURE, {
    ANTHROPIC_API_KEY: "sk-anth",
    ALIBABA_CLAUDE_CODE_API_KEY: "ali-secret",
  });
  const alibaba = cfg.providers.find((p) => p.id === "alibaba-coding")!;
  expect(alibaba.env.ANTHROPIC_AUTH_TOKEN).toBe("ali-secret");
  expect(alibaba.env.ANTHROPIC_BASE_URL).toBe(
    "https://coding-intl.dashscope.aliyuncs.com/apps/anthropic",
  );
});

test("missing env throws clear error mentioning the var name", () => {
  expect(() =>
    loadConfig(FIXTURE, { ANTHROPIC_API_KEY: "x" }),
  ).toThrow(/ALIBABA_CLAUDE_CODE_API_KEY/);
});

test("Codex provider preserves codexProfile", () => {
  const cfg = loadConfig(FIXTURE, {
    ANTHROPIC_API_KEY: "x",
    ALIBABA_CLAUDE_CODE_API_KEY: "y",
  });
  const codex = cfg.providers.find((p) => p.harness === "codex")!;
  expect(codex.codexProfile).toBe("openrouter");
});

test("pricing_mode defaults to 'unknown' when omitted", () => {
  const cfg = loadConfig(FIXTURE, {
    ANTHROPIC_API_KEY: "x",
    ALIBABA_CLAUDE_CODE_API_KEY: "y",
  });
  const codex = cfg.providers.find((p) => p.harness === "codex")!;
  expect(codex.pricingMode).toBe("unknown");
});

test("model fields map to camelCase", () => {
  const cfg = loadConfig(FIXTURE, {
    ANTHROPIC_API_KEY: "x",
    ALIBABA_CLAUDE_CODE_API_KEY: "y",
  });
  const direct = cfg.providers.find((p) => p.id === "anthropic-direct")!;
  expect(direct.models[0].id).toBe("claude-haiku-4-5");
  expect(direct.models[0].tier).toBe("haiku");
  expect(direct.models[0].inputCostPerMtok).toBe(0.8);
  expect(direct.models[0].outputCostPerMtok).toBe(4.0);
});
