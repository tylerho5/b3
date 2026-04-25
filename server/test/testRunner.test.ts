import { test, expect } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTestPhase } from "../src/orchestrator/testRunner";

function mkWorkdir(): string {
  return mkdtempSync(join(tmpdir(), "b3-tr-"));
}

test("exit 0 → tests_passed (exitCode 0)", async () => {
  const wd = mkWorkdir();
  try {
    const result = await runTestPhase({
      workdir: wd,
      testCommand: "true",
      timeoutMs: 10_000,
    });
    expect(result.exitCode).toBe(0);
    expect(existsSync(result.logPath)).toBe(true);
  } finally {
    rmSync(wd, { recursive: true, force: true });
  }
});

test("nonzero exit → exitCode != 0", async () => {
  const wd = mkWorkdir();
  try {
    const result = await runTestPhase({
      workdir: wd,
      testCommand: "false",
      timeoutMs: 10_000,
    });
    expect(result.exitCode).not.toBe(0);
  } finally {
    rmSync(wd, { recursive: true, force: true });
  }
});

test("captures stdout + stderr to log", async () => {
  const wd = mkWorkdir();
  try {
    const result = await runTestPhase({
      workdir: wd,
      testCommand: "echo OUT; echo ERR 1>&2",
      timeoutMs: 10_000,
    });
    expect(result.exitCode).toBe(0);
    const log = readFileSync(result.logPath, "utf-8");
    expect(log).toContain("OUT");
    expect(log).toContain("ERR");
  } finally {
    rmSync(wd, { recursive: true, force: true });
  }
});

test("timeout: long-running command is killed", async () => {
  const wd = mkWorkdir();
  try {
    const start = Date.now();
    const result = await runTestPhase({
      workdir: wd,
      testCommand: "sleep 30",
      timeoutMs: 500,
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5_000);
    expect(result.exitCode).not.toBe(0);
  } finally {
    rmSync(wd, { recursive: true, force: true });
  }
});

test("two concurrent test phases serialize (one runs at a time)", async () => {
  const wd1 = mkWorkdir();
  const wd2 = mkWorkdir();
  try {
    const t0 = Date.now();
    const log: { id: string; ev: "start" | "end"; t: number }[] = [];
    const sleeper = async (id: string, dir: string) => {
      log.push({ id, ev: "start", t: Date.now() - t0 });
      await runTestPhase({
        workdir: dir,
        testCommand: "sleep 0.3",
        timeoutMs: 5_000,
      });
      log.push({ id, ev: "end", t: Date.now() - t0 });
    };
    await Promise.all([sleeper("a", wd1), sleeper("b", wd2)]);
    // The two end events must NOT be within the same overlap window —
    // i.e., end of one must precede start of the other (serialization).
    const aStart = log.find((e) => e.id === "a" && e.ev === "start")!.t;
    const aEnd = log.find((e) => e.id === "a" && e.ev === "end")!.t;
    const bStart = log.find((e) => e.id === "b" && e.ev === "start")!.t;
    const bEnd = log.find((e) => e.id === "b" && e.ev === "end")!.t;
    // No overlap: either A ends before B starts running test, or vice-versa.
    // Both intervals (start..end) must not overlap. The test runner's mutex
    // is the gate; sleeper start logs the moment we *call* runTestPhase.
    // What we measure is total wall: serialized takes ~600ms, parallel ~300ms.
    const totalWall = Math.max(aEnd, bEnd);
    expect(totalWall).toBeGreaterThan(550);
  } finally {
    rmSync(wd1, { recursive: true, force: true });
    rmSync(wd2, { recursive: true, force: true });
  }
});
