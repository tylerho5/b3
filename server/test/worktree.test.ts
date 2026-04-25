import { test, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
  appendFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWorktree,
  removeWorktree,
  captureDiff,
} from "../src/worktree/manager";

let tmp: string;
let baseRepo: string;
let baseCommit: string;
let runsRoot: string;

function sh(cmd: string[], cwd: string): string {
  const proc = Bun.spawnSync(cmd, { cwd, stderr: "pipe", stdout: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(
      `cmd ${cmd.join(" ")} failed: ${proc.stderr.toString()}`,
    );
  }
  return proc.stdout.toString().trim();
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "b3-wt-"));
  baseRepo = join(tmp, "base");
  runsRoot = join(tmp, "runs");
  mkdirSync(baseRepo, { recursive: true });
  mkdirSync(runsRoot, { recursive: true });
  sh(["git", "init", "-q", "-b", "main"], baseRepo);
  sh(["git", "config", "user.email", "t@t"], baseRepo);
  sh(["git", "config", "user.name", "t"], baseRepo);
  writeFileSync(join(baseRepo, "a.txt"), "hello\n");
  sh(["git", "add", "a.txt"], baseRepo);
  sh(["git", "commit", "-q", "-m", "init"], baseRepo);
  baseCommit = sh(["git", "rev-parse", "HEAD"], baseRepo);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

test("createWorktree clones base repo at base commit", async () => {
  const runId = "run-1";
  const wt = await createWorktree({
    runId,
    baseRepo,
    baseCommit,
    runsRoot,
  });
  expect(wt.workdir).toBe(join(runsRoot, runId, "workdir"));
  expect(existsSync(join(wt.workdir, "a.txt"))).toBe(true);
  expect(readFileSync(join(wt.workdir, "a.txt"), "utf-8")).toBe("hello\n");
  expect(existsSync(join(wt.workdir, ".git"))).toBe(true);
});

test("createWorktree with baseRepo=null creates empty git repo with one commit", async () => {
  const runId = "run-2";
  const wt = await createWorktree({
    runId,
    baseRepo: null,
    baseCommit: null,
    runsRoot,
  });
  expect(existsSync(join(wt.workdir, ".git"))).toBe(true);
  const log = sh(
    ["git", "log", "--oneline"],
    wt.workdir,
  );
  expect(log.length).toBeGreaterThan(0);
  expect(wt.baseCommit).toBeTruthy();
});

test("captureDiff returns modified file contents after edits", async () => {
  const runId = "run-3";
  const wt = await createWorktree({
    runId,
    baseRepo,
    baseCommit,
    runsRoot,
  });
  appendFileSync(join(wt.workdir, "a.txt"), "world\n");
  writeFileSync(join(wt.workdir, "b.txt"), "new\n");
  const diff = await captureDiff(wt.workdir, baseCommit);
  expect(diff).toContain("a.txt");
  expect(diff).toContain("b.txt");
  expect(diff).toContain("world");
});

test("removeWorktree cleans up workdir", async () => {
  const runId = "run-4";
  const wt = await createWorktree({
    runId,
    baseRepo,
    baseCommit,
    runsRoot,
  });
  expect(existsSync(wt.workdir)).toBe(true);
  await removeWorktree({ runId, baseRepo, runsRoot, workdir: wt.workdir });
  expect(existsSync(wt.workdir)).toBe(false);
});
