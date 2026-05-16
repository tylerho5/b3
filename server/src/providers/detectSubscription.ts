import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface SubscriptionStatus {
  installed: boolean;
  authenticated: boolean;
  version?: string;
  details?: string;
}

export type RunSpawn = (cmd: string[]) => {
  exitCode: number | null;
  stdout: Uint8Array;
};

function defaultRunSpawn(cmd: string[]): ReturnType<RunSpawn> {
  return Bun.spawnSync(cmd);
}

function readClaudeKeychainMacOS(runSpawn: RunSpawn = defaultRunSpawn): boolean {
  if (process.platform !== "darwin") return false;
  try {
    const r = runSpawn([
      "security",
      "find-generic-password",
      "-s",
      "Claude Code-credentials",
      "-w",
    ]);
    if (r.exitCode !== 0) return false;
    const out = new TextDecoder().decode(r.stdout).trim();
    if (!out) return false;
    JSON.parse(out);
    return true;
  } catch {
    return false;
  }
}

export function detectClaudeSubscription(
  opts: { home?: string; runSpawn?: RunSpawn } = {},
): SubscriptionStatus {
  const home = opts.home ?? homedir();
  const installed = probeBinary("claude");
  const credsPath = join(home, ".claude", ".credentials.json");
  const authenticated =
    readCredsValid(credsPath) || readClaudeKeychainMacOS(opts.runSpawn);
  return {
    installed: installed.ok,
    authenticated,
    version: installed.version,
  };
}

export function detectCodexSubscription(
  opts: { home?: string } = {},
): SubscriptionStatus {
  const home = opts.home ?? homedir();
  const installed = probeBinary("codex");
  const credsPath = join(home, ".codex", "auth.json");
  const authenticated = readCredsValid(credsPath);
  return {
    installed: installed.ok,
    authenticated,
    version: installed.version,
  };
}

function probeBinary(name: string): { ok: boolean; version?: string } {
  try {
    const r = Bun.spawnSync([name, "--version"]);
    if (r.exitCode !== 0) return { ok: false };
    const out = new TextDecoder().decode(r.stdout).trim();
    return { ok: true, version: out };
  } catch {
    return { ok: false };
  }
}

function readCredsValid(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const stat = statSync(path);
    if (stat.size === 0) return false;
    const raw = readFileSync(path, "utf-8");
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}
