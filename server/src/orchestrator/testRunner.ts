import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";

export interface TestPhaseInput {
  workdir: string;
  testCommand: string;
  timeoutMs: number;
}

export interface TestPhaseResult {
  exitCode: number;
  logPath: string;
}

let mutexChain: Promise<unknown> = Promise.resolve();

function acquireMutex<T>(fn: () => Promise<T>): Promise<T> {
  const next = mutexChain.then(fn, fn);
  mutexChain = next.catch(() => {});
  return next;
}

export async function runTestPhase(
  input: TestPhaseInput,
): Promise<TestPhaseResult> {
  return acquireMutex(async () => {
    const logPath = resolve(input.workdir, "..", "test.log");
    await mkdir(dirname(logPath), { recursive: true });

    const proc = Bun.spawn(["sh", "-c", input.testCommand], {
      cwd: input.workdir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // already exited
      }
    }, input.timeoutMs);

    const stdoutP = new Response(proc.stdout).text();
    const stderrP = new Response(proc.stderr).text();
    const code = await proc.exited;
    clearTimeout(timer);
    const stdout = await stdoutP;
    const stderr = await stderrP;

    await Bun.write(
      logPath,
      `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}\n`,
    );

    return {
      exitCode: code ?? -1,
      logPath,
    };
  });
}
