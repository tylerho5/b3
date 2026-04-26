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
  pluginName?: string;
  pluginVersion?: string;
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

// Recognizes the segment between `<plugin>/` and `/skills/` as a "version-like"
// directory. Real semver, v-prefixed, "unknown" placeholder, or a git-hash slug.
const VERSION_RE = /^v?\d+(\.\d+)*$/;
const HASH_RE = /^[0-9a-f]{6,40}$/;
function isVersionLike(s: string): boolean {
  return s === "unknown" || VERSION_RE.test(s) || HASH_RE.test(s);
}

// Compares two version strings numerically segment-by-segment.
// "unknown" is always less than any real version.
export function compareVersions(a: string, b: string): number {
  if (a === "unknown" && b === "unknown") return 0;
  if (a === "unknown") return -1;
  if (b === "unknown") return 1;

  const aNorm = a.startsWith("v") ? a.slice(1) : a;
  const bNorm = b.startsWith("v") ? b.slice(1) : b;

  const aParts = aNorm.split(".");
  const bParts = bNorm.split(".");
  const len = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const aStr = aParts[i] ?? "0";
    const bStr = bParts[i] ?? "0";
    const aNum = parseInt(aStr, 10);
    const bNum = parseInt(bStr, 10);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum !== bNum) return aNum - bNum;
    } else {
      const cmp = aStr.localeCompare(bStr);
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
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

// skillsDir is the `skills/` directory. Its parent is typically a version
// segment (e.g. "4.1.1", "9f103c621dbe", or the literal "unknown") in which
// case the grandparent is the plugin name. If the parent doesn't look like a
// version, treat it as the plugin name itself.
function resolvePluginMeta(skillsDir: string): {
  pluginName: string;
  pluginVersion: string;
} {
  const parts = skillsDir.split("/");
  const parentName = parts[parts.length - 2];
  const grandparentName = parts[parts.length - 3];

  if (isVersionLike(parentName)) {
    return { pluginName: grandparentName, pluginVersion: parentName };
  }
  return { pluginName: parentName, pluginVersion: "unknown" };
}

export function discoverSkills(home = homedir()): SkillBundle[] {
  const out: SkillBundle[] = [];

  for (const s of skillsIn(join(home, ".claude/skills"))) {
    out.push(makeBundle(s, "user_claude", "user (~/.claude/skills)"));
  }

  const pluginsRoot = join(home, ".claude/plugins/cache");
  if (existsSync(pluginsRoot)) {
    // Collect all plugin skill candidates, keyed by (pluginName, skillName).
    // Keep only the highest version per pair to eliminate duplicate versions.
    type Candidate = {
      skillEntry: { name: string; path: string };
      pluginName: string;
      pluginVersion: string;
    };
    const best = new Map<string, Candidate>();

    for (const plugin of readdirSync(pluginsRoot, { withFileTypes: true })) {
      if (!plugin.isDirectory()) continue;
      walkForSkills(join(pluginsRoot, plugin.name), 4, (skillsDir) => {
        const { pluginName, pluginVersion } = resolvePluginMeta(skillsDir);
        for (const s of skillsIn(skillsDir)) {
          const key = `${pluginName}::${s.name}`;
          const existing = best.get(key);
          if (!existing || compareVersions(pluginVersion, existing.pluginVersion) > 0) {
            best.set(key, { skillEntry: s, pluginName, pluginVersion });
          }
        }
      });
    }

    for (const { skillEntry, pluginName, pluginVersion } of best.values()) {
      const md = readFileSync(join(skillEntry.path, "SKILL.md"), "utf-8");
      const fm = parseFrontmatter(md);
      const versionSuffix = pluginVersion !== "unknown" ? ` ${pluginVersion}` : "";
      out.push({
        id: `plugin:${pluginName}:${skillEntry.name}`,
        name: fm.name ?? skillEntry.name,
        description: fm.description ?? "",
        source: "plugin",
        sourceLabel: `plugin (${pluginName}${versionSuffix})`,
        path: skillEntry.path,
        pluginName,
        pluginVersion,
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
