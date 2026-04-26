import type { SkillBundle } from "../../types/shared";

export interface PluginGroup {
  pluginName: string;
  pluginVersion?: string;
  skills: SkillBundle[];
}

export interface GroupedSkills {
  user: SkillBundle[];
  plugins: PluginGroup[];
}

export function groupSkills(skills: SkillBundle[]): GroupedSkills {
  const user: SkillBundle[] = [];
  const pluginMap = new Map<string, PluginGroup>();
  for (const s of skills) {
    if (s.source === "plugin") {
      const name = s.pluginName ?? "plugin";
      let g = pluginMap.get(name);
      if (!g) {
        g = { pluginName: name, pluginVersion: s.pluginVersion, skills: [] };
        pluginMap.set(name, g);
      }
      g.skills.push(s);
    } else {
      user.push(s);
    }
  }
  for (const g of pluginMap.values()) g.skills.sort(byName);
  user.sort(byName);
  const plugins = Array.from(pluginMap.values()).sort((a, b) =>
    a.pluginName.localeCompare(b.pluginName),
  );
  return { user, plugins };
}

function byName(a: SkillBundle, b: SkillBundle): number {
  return a.name.localeCompare(b.name);
}

export type MasterState = "none" | "partial" | "all";

export function masterStateOf(
  ids: readonly string[],
  selected: ReadonlySet<string>,
): MasterState {
  if (ids.length === 0) return "none";
  let count = 0;
  for (const id of ids) if (selected.has(id)) count++;
  if (count === 0) return "none";
  if (count === ids.length) return "all";
  return "partial";
}

export function selectedCount(
  ids: readonly string[],
  selected: ReadonlySet<string>,
): number {
  let n = 0;
  for (const id of ids) if (selected.has(id)) n++;
  return n;
}

export function toggleAll(
  ids: readonly string[],
  selected: ReadonlySet<string>,
): Set<string> {
  const next = new Set(selected);
  const state = masterStateOf(ids, selected);
  if (state === "all") {
    for (const id of ids) next.delete(id);
  } else {
    for (const id of ids) next.add(id);
  }
  return next;
}

export function filterSkills(skills: SkillBundle[], q: string): SkillBundle[] {
  const trimmed = q.trim().toLowerCase();
  if (!trimmed) return skills;
  return skills.filter(
    (s) =>
      s.name.toLowerCase().includes(trimmed) ||
      s.description.toLowerCase().includes(trimmed) ||
      (s.pluginName?.toLowerCase().includes(trimmed) ?? false),
  );
}
