import { test, expect, beforeEach } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type DB } from "../src/db";
import { runMigrations } from "../src/db/migrations";
import { listProviders } from "../src/db/providers";
import { listProviderModels } from "../src/db/providerModels";
import { getSetting } from "../src/db/appSettings";
import { importLegacyTomlOnce } from "../src/providers/importLegacyToml";

const FIXTURE_TOML = `
version = 1

[judge]
template = "score an AI coding agent's run on this benchmark task"

[[providers.claude_code]]
id = "anthropic-direct"
label = "Anthropic (direct)"
pricing_mode = "per_token"
env.ANTHROPIC_API_KEY = "\${ANTHROPIC_API_KEY}"
models = [
  { id = "claude-opus-4-7",   tier = "opus",   input_cost_per_mtok = 15.0,  output_cost_per_mtok = 75.0 },
  { id = "claude-sonnet-4-6", tier = "sonnet", input_cost_per_mtok = 3.0,   output_cost_per_mtok = 15.0 },
]

[[providers.claude_code]]
id = "openrouter-claude"
label = "OpenRouter (Claude Code)"
pricing_mode = "per_token"
env.ANTHROPIC_BASE_URL   = "https://openrouter.ai/api"
env.ANTHROPIC_AUTH_TOKEN = "\${OPENROUTER_KEY}"
models = [
  { id = "anthropic/claude-sonnet-4.6", input_cost_per_mtok = 3.0, output_cost_per_mtok = 15.0 },
  { id = "google/gemini-3-pro" },
]

[[providers.codex]]
id = "openai-direct"
label = "OpenAI (direct)"
pricing_mode = "subscription"
env.OPENAI_API_KEY = "\${OPENAI_API_KEY}"
models = [
  { id = "gpt-5.5" },
]

[[providers.codex]]
id = "openrouter-codex"
label = "OpenRouter (Codex)"
pricing_mode = "per_token"
env.OPENAI_BASE_URL = "https://openrouter.ai/api/v1"
env.OPENAI_API_KEY  = "\${OPENROUTER_KEY}"
models = [
  { id = "z-ai/glm-4.6" },
]
`;

let db: DB;
let home: string;
beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
  home = mkdtempSync(join(tmpdir(), "b3-import-"));
});

test("imports legacy TOML when DB is empty and TOML is present", () => {
  mkdirSync(join(home, ".config", "b3"), { recursive: true });
  const tomlPath = join(home, ".config", "b3", "config.toml");
  writeFileSync(tomlPath, FIXTURE_TOML);

  const result = importLegacyTomlOnce({ db, home });
  expect(result.imported).toBe(true);

  const providers = listProviders(db);
  // anthropic-direct + openai-direct + 1 coalesced openrouter = 3
  expect(providers).toHaveLength(3);
  expect(providers.find((p) => p.kind === "anthropic_api_direct")).toBeDefined();
  expect(providers.find((p) => p.kind === "openai_api_direct")).toBeDefined();
  const or = providers.find((p) => p.kind === "openrouter")!;
  expect(or).toBeDefined();
  expect(or.apiKeyEnvRef).toBe("OPENROUTER_KEY");
  const orModels = listProviderModels(db, or.id);
  expect(orModels.map((m) => m.modelId).sort()).toEqual([
    "anthropic/claude-sonnet-4.6",
    "google/gemini-3-pro",
    "z-ai/glm-4.6",
  ]);

  expect(getSetting(db, "judge_template")).toContain("score an AI coding agent");
  expect(existsSync(tomlPath)).toBe(false);
  expect(existsSync(`${tomlPath}.imported`)).toBe(true);
});

test("noop when DB already has providers", () => {
  mkdirSync(join(home, ".config", "b3"), { recursive: true });
  const tomlPath = join(home, ".config", "b3", "config.toml");
  writeFileSync(tomlPath, FIXTURE_TOML);

  // Seed DB.
  const { createProvider } = require("../src/db/providers");
  createProvider(db, { name: "existing", kind: "openrouter", apiKey: "k" });

  const result = importLegacyTomlOnce({ db, home });
  expect(result.imported).toBe(false);
  expect(existsSync(tomlPath)).toBe(true); // not renamed
  expect(listProviders(db)).toHaveLength(1);
});

test("noop when TOML is absent", () => {
  const result = importLegacyTomlOnce({ db, home });
  expect(result.imported).toBe(false);
  expect(listProviders(db)).toHaveLength(0);
});

test("preserves the original TOML at .imported on success", () => {
  mkdirSync(join(home, ".config", "b3"), { recursive: true });
  const tomlPath = join(home, ".config", "b3", "config.toml");
  writeFileSync(tomlPath, FIXTURE_TOML);

  importLegacyTomlOnce({ db, home });

  const archived = readFileSync(`${tomlPath}.imported`, "utf-8");
  expect(archived).toBe(FIXTURE_TOML);
});

test("importLegacyTomlOnce uses an explicit configPath when provided", () => {
  const customPath = join(home, "custom-config.toml");
  writeFileSync(customPath, FIXTURE_TOML);
  const result = importLegacyTomlOnce({ db, configPath: customPath });
  expect(result.imported).toBe(true);
  expect(existsSync(customPath)).toBe(false);
  expect(existsSync(`${customPath}.imported`)).toBe(true);
});
