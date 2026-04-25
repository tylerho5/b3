import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import type { SkillBundle } from "./registry";

export type MaterializeMode = "copy" | "symlink";

export async function materializeSkills(
  workdir: string,
  bundles: SkillBundle[],
  mode: MaterializeMode,
): Promise<void> {
  const seen = new Map<string, SkillBundle>();
  for (const b of bundles) {
    const prior = seen.get(b.name);
    if (prior) {
      throw new Error(
        `Skill name collision: "${b.name}" appears in both ` +
          `"${prior.sourceLabel}" and "${b.sourceLabel}". ` +
          `Deselect one before launching.`,
      );
    }
    seen.set(b.name, b);
  }

  const claudeDir = join(workdir, ".claude/skills");
  const agentsDir = join(workdir, ".agents/skills");
  await mkdir(claudeDir, { recursive: true });
  await mkdir(agentsDir, { recursive: true });

  for (const b of bundles) {
    const dest1 = join(claudeDir, b.name);
    const dest2 = join(agentsDir, b.name);
    if (mode === "copy") {
      await copyDir(b.path, dest1);
      await copyDir(b.path, dest2);
    } else {
      await symlink(b.path, dest1);
      await symlink(b.path, dest2);
    }
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  const proc = Bun.spawn(["cp", "-R", src, dest], {
    stderr: "pipe",
    stdout: "pipe",
  });
  const code = await proc.exited;
  if (code !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`cp -R ${src} ${dest} failed (${code}): ${err}`);
  }
}
