import type { SkillBundle } from "../types/shared";

const SOURCE_ORDER: SkillBundle["source"][] = [
  "user_claude",
  "plugin",
  "user_codex",
  "user_agents",
];

const SOURCE_LABEL: Record<SkillBundle["source"], string> = {
  user_claude: "user (~/.claude/skills)",
  plugin: "plugin (~/.claude/plugins)",
  user_codex: "user (~/.codex/skills)",
  user_agents: "user (~/.agents/skills)",
};

export function SkillBundleList({ skills }: { skills: SkillBundle[] }) {
  const grouped = new Map<SkillBundle["source"], SkillBundle[]>();
  for (const s of skills) {
    const arr = grouped.get(s.source) ?? [];
    arr.push(s);
    grouped.set(s.source, arr);
  }

  return (
    <div className="skills-page">
      {SOURCE_ORDER.map((src) => {
        const items = (grouped.get(src) ?? []).sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        if (items.length === 0) return null;
        return (
          <div className="skills-section" key={src}>
            <div className="skills-section-head">
              <span>{SOURCE_LABEL[src]}</span>
              <span className="count">{items.length}</span>
            </div>
            <div className="skills-list">
              {items.map((s) => (
                <div className={`skill-row ${s.source}`} key={s.id}>
                  <div className="name">{s.name}</div>
                  {s.description && <div className="desc">{s.description}</div>}
                  <div className="path">{s.path}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {skills.length === 0 && (
        <div className="placeholder">no skills discovered</div>
      )}
    </div>
  );
}
