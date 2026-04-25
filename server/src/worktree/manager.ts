import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface WorktreeInfo {
  runId: string;
  workdir: string;
  baseRepo: string | null;
  baseCommit: string;
}

export interface CreateWorktreeInput {
  runId: string;
  baseRepo: string | null;
  baseCommit: string | null;
  runsRoot: string;
}

async function run(
  cmd: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, {
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  const code = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  if (code !== 0) {
    throw new Error(
      `${cmd.join(" ")} failed in ${cwd} (${code}): ${stderr}`,
    );
  }
  return { stdout, stderr };
}

export async function createWorktree(
  input: CreateWorktreeInput,
): Promise<WorktreeInfo> {
  const runDir = join(input.runsRoot, input.runId);
  const workdir = join(runDir, "workdir");
  await mkdir(runDir, { recursive: true });

  if (input.baseRepo == null) {
    await mkdir(workdir, { recursive: true });
    await run(["git", "init", "-q", "-b", "main"], workdir);
    await run(["git", "config", "user.email", "b3@local"], workdir);
    await run(["git", "config", "user.name", "b3"], workdir);
    await writeFile(join(workdir, ".gitkeep"), "");
    await run(["git", "add", ".gitkeep"], workdir);
    await run(["git", "commit", "-q", "--allow-empty", "-m", "base"], workdir);
    const sha = (await run(["git", "rev-parse", "HEAD"], workdir)).stdout.trim();
    return {
      runId: input.runId,
      workdir,
      baseRepo: null,
      baseCommit: sha,
    };
  }

  const branch = `b3/${input.runId}`;
  if (!input.baseCommit) {
    throw new Error("baseCommit required when baseRepo is set");
  }
  await run(
    [
      "git",
      "worktree",
      "add",
      "-q",
      "-b",
      branch,
      workdir,
      input.baseCommit,
    ],
    input.baseRepo,
  );
  return {
    runId: input.runId,
    workdir,
    baseRepo: input.baseRepo,
    baseCommit: input.baseCommit,
  };
}

export async function captureDiff(
  workdir: string,
  baseCommit: string,
): Promise<string> {
  await run(["git", "add", "-A"], workdir);
  const { stdout } = await run(
    ["git", "diff", "--cached", baseCommit],
    workdir,
  );
  return stdout;
}

export interface RemoveWorktreeInput {
  runId: string;
  baseRepo: string | null;
  runsRoot: string;
  workdir: string;
}

export async function removeWorktree(
  input: RemoveWorktreeInput,
): Promise<void> {
  if (input.baseRepo) {
    try {
      await run(
        ["git", "worktree", "remove", "--force", input.workdir],
        input.baseRepo,
      );
    } catch {
      await rm(input.workdir, { recursive: true, force: true });
    }
    try {
      await run(
        ["git", "branch", "-D", `b3/${input.runId}`],
        input.baseRepo,
      );
    } catch {
      // best-effort
    }
  } else {
    await rm(input.workdir, { recursive: true, force: true });
  }
}
