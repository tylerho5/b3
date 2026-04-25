import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type SkillSource =
  | "user_claude"
  | "plugin"
  | "user_codex"
  | "user_agents";

export interface SkillBundle {
  id: string;
  name: string;
  description: string;
  source: SkillSource;
  sourceLabel: string;
  path: string;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

function parseFrontmatter(md: string): Record<string, string> {
  const m = FRONTMATTER_RE.exec(md);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    out[k] = v;
  }
  return out;
}

function* skillsIn(
  root: string,
): Generator<{ name: string; path: string }> {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    const path = join(root, entry.name);
    const skillMd = join(path, "SKILL.md");
    if (existsSync(skillMd)) yield { name: entry.name, path };
  }
}

function makeBundle(
  s: { name: string; path: string },
  source: SkillSource,
  sourceLabel: string,
): SkillBundle {
  const md = readFileSync(join(s.path, "SKILL.md"), "utf-8");
  const fm = parseFrontmatter(md);
  return {
    id: `${source}:${s.name}`,
    name: fm.name ?? s.name,
    description: fm.description ?? "",
    source,
    sourceLabel,
    path: s.path,
  };
}

function walkForSkills(
  root: string,
  depth: number,
  cb: (skillsDir: string) => void,
): void {
  if (depth < 0 || !existsSync(root)) return;
  const skillsHere = join(root, "skills");
  if (existsSync(skillsHere)) cb(skillsHere);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    walkForSkills(join(root, entry.name), depth - 1, cb);
  }
}

export function discoverSkills(home = homedir()): SkillBundle[] {
  const out: SkillBundle[] = [];

  for (const s of skillsIn(join(home, ".claude/skills"))) {
    out.push(makeBundle(s, "user_claude", "user (~/.claude/skills)"));
  }

  const pluginsRoot = join(home, ".claude/plugins/cache");
  if (existsSync(pluginsRoot)) {
    for (const plugin of readdirSync(pluginsRoot, { withFileTypes: true })) {
      if (!plugin.isDirectory()) continue;
      walkForSkills(join(pluginsRoot, plugin.name), 4, (path) => {
        for (const s of skillsIn(path)) {
          out.push(makeBundle(s, "plugin", `plugin (${plugin.name})`));
        }
      });
    }
  }

  for (const s of skillsIn(join(home, ".codex/skills"))) {
    out.push(makeBundle(s, "user_codex", "user (~/.codex/skills)"));
  }

  for (const s of skillsIn(join(home, ".agents/skills"))) {
    out.push(makeBundle(s, "user_agents", "user (~/.agents/skills)"));
  }

  return out;
}
