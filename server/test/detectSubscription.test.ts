import { test, expect, beforeEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectClaudeSubscription,
  detectCodexSubscription,
} from "../src/providers/detectSubscription";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "b3-detect-"));
});

test("claude: not authenticated when credentials file is absent", () => {
  mkdirSync(join(home, ".claude"), { recursive: true });
  const r = detectClaudeSubscription({ home });
  expect(r.authenticated).toBe(false);
});

test("claude: authenticated when credentials file present and valid JSON", () => {
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(
    join(home, ".claude", ".credentials.json"),
    JSON.stringify({ token: "fake-oauth-token" }),
  );
  const r = detectClaudeSubscription({ home });
  expect(r.authenticated).toBe(true);
});

test("claude: not authenticated when credentials file is empty", () => {
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(join(home, ".claude", ".credentials.json"), "");
  const r = detectClaudeSubscription({ home });
  expect(r.authenticated).toBe(false);
});

test("claude: not authenticated when credentials file is invalid JSON", () => {
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(join(home, ".claude", ".credentials.json"), "{not json");
  const r = detectClaudeSubscription({ home });
  expect(r.authenticated).toBe(false);
});

test("codex: not authenticated when no creds file in known locations", () => {
  mkdirSync(join(home, ".codex"), { recursive: true });
  const r = detectCodexSubscription({ home });
  expect(r.authenticated).toBe(false);
});

test("codex: authenticated when ~/.codex/auth.json present and valid", () => {
  mkdirSync(join(home, ".codex"), { recursive: true });
  writeFileSync(
    join(home, ".codex", "auth.json"),
    JSON.stringify({ access_token: "x" }),
  );
  const r = detectCodexSubscription({ home });
  expect(r.authenticated).toBe(true);
});
