import { readFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import TOML from "@iarna/toml";
import type {
  B3Config,
  Harness,
  ModelCard,
  ProviderConfig,
} from "./types";

const ENV_RE = /\$\{([A-Z_][A-Z0-9_]*)\}/g;

const __dirname = dirname(fileURLToPath(import.meta.url));

function interpolate(
  s: string,
  env: Record<string, string | undefined>,
): string {
  return s.replace(ENV_RE, (_, name) => {
    const v = env[name];
    if (v == null) {
      throw new Error(`Config references missing env var: ${name}`);
    }
    return v;
  });
}

interface RawModel {
  id: string;
  tier?: ModelCard["tier"];
  input_cost_per_mtok?: number;
  output_cost_per_mtok?: number;
}

interface RawProvider {
  id: string;
  label?: string;
  pricing_mode?: ProviderConfig["pricingMode"];
  env?: Record<string, string>;
  codex_profile?: string;
  models?: RawModel[];
}

interface RawConfig {
  version?: number;
  judge?: { template?: string };
  providers?: {
    claude_code?: RawProvider[];
    codex?: RawProvider[];
  };
}

export interface LoadConfigOptions {
  /** When true (default false), silently skip providers whose env vars are
   *  missing instead of throwing. Use for server startup; tests use strict. */
  soft?: boolean;
  /** Receives diagnostics about skipped providers (soft mode only). */
  onWarn?: (msg: string) => void;
}

export function loadConfig(
  path: string,
  env: Record<string, string | undefined> = process.env,
  options: LoadConfigOptions = {},
): B3Config {
  const raw = TOML.parse(readFileSync(path, "utf-8")) as unknown as RawConfig;
  const providers: ProviderConfig[] = [];
  const harnesses: Harness[] = ["claude_code", "codex"];
  for (const harness of harnesses) {
    const blocks = raw.providers?.[harness] ?? [];
    for (const b of blocks) {
      const interpolatedEnv: Record<string, string> = {};
      try {
        for (const [k, v] of Object.entries(b.env ?? {})) {
          interpolatedEnv[k] = interpolate(String(v), env);
        }
      } catch (e) {
        if (options.soft) {
          options.onWarn?.(
            `skipping provider ${harness}:${b.id} — ${(e as Error).message}`,
          );
          continue;
        }
        throw e;
      }
      providers.push({
        harness,
        id: b.id,
        label: b.label ?? b.id,
        pricingMode: b.pricing_mode ?? "unknown",
        env: interpolatedEnv,
        codexProfile: b.codex_profile,
        models: (b.models ?? []).map((m) => ({
          id: m.id,
          tier: m.tier,
          inputCostPerMtok: m.input_cost_per_mtok,
          outputCostPerMtok: m.output_cost_per_mtok,
        })),
      });
    }
  }
  return {
    version: raw.version ?? 1,
    judge: { template: raw.judge?.template ?? "" },
    providers,
  };
}

export function getDefaultConfigPath(home = homedir()): string {
  return process.env.B3_CONFIG_PATH ?? join(home, ".config/b3/config.toml");
}

const BUNDLED_DEFAULT = resolve(__dirname, "default.toml");

export function loadConfigOrInit(
  path: string = getDefaultConfigPath(),
  env: Record<string, string | undefined> = process.env,
  options: LoadConfigOptions = { soft: true },
): B3Config {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    copyFileSync(BUNDLED_DEFAULT, path);
  }
  return loadConfig(path, env, options);
}
