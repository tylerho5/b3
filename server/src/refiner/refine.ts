import { spawn } from "node:child_process";
import { z } from "zod";

export const RefinedTaskSchema = z.object({
  name: z.string().min(1).max(80),
  prompt: z.string().min(1),
  test_command: z.string(),
  base_repo_setup: z.string(),
  notes: z.string(),
});
export type RefinedTask = z.infer<typeof RefinedTaskSchema>;

export class RefinerParseError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message);
    this.name = "RefinerParseError";
  }
}

const META_PROMPT = (draft: string) =>
  `You are helping me author a coding-agent benchmark task for a tool called b3.
b3 runs an AI coding agent in a fresh git worktree, gives it a prompt, then runs
a shell test command to score success.

My rough idea:
${draft}

Reply with a single JSON object matching this schema, and nothing else:

{
  "name": "<short slug, 1-5 words>",
  "prompt": "<the prompt to give the coding agent. 1-3 paragraphs. Be specific
             about what success looks like and what files / behaviors should
             change. Do not reference b3 itself.>",
  "test_command": "<a shell command that exits 0 if the agent succeeded, nonzero
                   otherwise. Prefer fast deterministic checks (pytest, npm
                   test, grep against output, etc.).>",
  "base_repo_setup": "<shell commands to set up the starting repo state, OR an
                      empty string if this is greenfield. The user will run
                      these manually before pinning the base commit.>",
  "notes": "<one short sentence flagging any ambiguity or assumptions you made.>"
}`;

export async function refineTask(input: {
  draft: string;
  signal?: AbortSignal;
}): Promise<RefinedTask> {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--dangerously-skip-permissions",
  ];
  const model = process.env.B3_REFINER_MODEL;
  if (model) args.push("--model", model);

  const proc = spawn("claude", args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const timer = setTimeout(() => {
    try {
      proc.kill("SIGKILL");
    } catch {
      // already exited
    }
  }, 60_000);

  if (input.signal) {
    input.signal.addEventListener(
      "abort",
      () => {
        try {
          proc.kill("SIGINT");
        } catch {
          // best-effort
        }
      },
      { once: true },
    );
  }

  proc.stdin!.write(META_PROMPT(input.draft));
  proc.stdin!.end();

  let stdout = "";
  let stderr = "";
  proc.stdout!.on("data", (c: Buffer) => {
    stdout += c.toString("utf-8");
  });
  proc.stderr!.on("data", (c: Buffer) => {
    stderr += c.toString("utf-8");
  });
  const code: number = await new Promise((resolve) => {
    proc.on("exit", (c) => resolve(c ?? -1));
  });
  clearTimeout(timer);

  if (code !== 0) {
    throw new Error(`claude exited ${code}: ${stderr.slice(0, 500)}`);
  }

  let wrapper: { result?: string };
  try {
    wrapper = JSON.parse(stdout);
  } catch (e) {
    throw new RefinerParseError(
      `Refiner wrapper not JSON: ${(e as Error).message}`,
      stdout,
    );
  }
  const text = wrapper.result ?? "";
  const stripped = text
    .replace(/^\s*```(?:json)?\s*/, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new RefinerParseError(
      "Refiner did not return valid JSON in result block",
      text,
    );
  }
  const valid = RefinedTaskSchema.safeParse(parsed);
  if (!valid.success) {
    throw new RefinerParseError(
      `Refiner JSON failed schema: ${valid.error.message}`,
      text,
    );
  }
  return valid.data;
}
