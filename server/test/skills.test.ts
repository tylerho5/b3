import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverSkills } from "../src/skills/registry";

function makeFakeHome() {
  const home = mkdtempSync(join(tmpdir(), "b3-skills-home-"));
  return home;
}

function writeSkill(
  root: string,
  name: string,
  frontmatter: { name?: string; description?: string },
  body = "Body.",
) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  const fm = [
    "---",
    `name: ${frontmatter.name ?? name}`,
    `description: ${frontmatter.description ?? ""}`,
    "---",
    "",
    body,
  ].join("\n");
  writeFileSync(join(dir, "SKILL.md"), fm);
}

test("discoverSkills finds skills in ~/.claude/skills/", () => {
  const home = makeFakeHome();
  try {
    const skillsDir = join(home, ".claude/skills");
    mkdirSync(skillsDir, { recursive: true });
    writeSkill(skillsDir, "alpha", { description: "the alpha skill" });
    const found = discoverSkills(home);
    expect(found.find((s) => s.name === "alpha")).toBeDefined();
    const alpha = found.find((s) => s.name === "alpha")!;
    expect(alpha.source).toBe("user_claude");
    expect(alpha.description).toBe("the alpha skill");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("frontmatter parsing reads name and description", () => {
  const home = makeFakeHome();
  try {
    const skillsDir = join(home, ".claude/skills");
    mkdirSync(skillsDir, { recursive: true });
    writeSkill(skillsDir, "beta", {
      name: "beta-skill",
      description: "beta does X",
    });
    const found = discoverSkills(home);
    const b = found.find((s) => s.id.endsWith(":beta"))!;
    expect(b.name).toBe("beta-skill");
    expect(b.description).toBe("beta does X");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("skips dirs without SKILL.md", () => {
  const home = makeFakeHome();
  try {
    const skillsDir = join(home, ".claude/skills");
    mkdirSync(join(skillsDir, "no-skill-md"), { recursive: true });
    writeSkill(skillsDir, "real", {});
    const found = discoverSkills(home);
    expect(found.map((s) => s.name)).toContain("real");
    expect(found.map((s) => s.name)).not.toContain("no-skill-md");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("source label identifies plugin vs user", () => {
  const home = makeFakeHome();
  try {
    writeSkill(join(home, ".claude/skills"), "u", {});
    const pluginSkills = join(
      home,
      ".claude/plugins/cache/my-plugin/skills",
    );
    mkdirSync(pluginSkills, { recursive: true });
    writeSkill(pluginSkills, "p", {});
    const found = discoverSkills(home);
    const u = found.find((s) => s.name === "u")!;
    const p = found.find((s) => s.name === "p")!;
    expect(u.source).toBe("user_claude");
    expect(u.sourceLabel).toContain(".claude");
    expect(p.source).toBe("plugin");
    expect(p.sourceLabel).toContain("my-plugin");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("two skills with same name from different sources both load", () => {
  const home = makeFakeHome();
  try {
    writeSkill(join(home, ".claude/skills"), "dup", {
      description: "user copy",
    });
    const pluginSkills = join(home, ".claude/plugins/cache/x/skills");
    mkdirSync(pluginSkills, { recursive: true });
    writeSkill(pluginSkills, "dup", { description: "plugin copy" });
    const found = discoverSkills(home);
    const dups = found.filter((s) => s.name === "dup");
    expect(dups).toHaveLength(2);
    expect(dups.map((d) => d.source).sort()).toEqual(
      ["plugin", "user_claude"].sort(),
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("walks plugin cache nested by source/version", () => {
  const home = makeFakeHome();
  try {
    const nested = join(
      home,
      ".claude/plugins/cache/claude-plugins-official/superpowers/4.1.1/skills",
    );
    mkdirSync(nested, { recursive: true });
    writeSkill(nested, "brainstorming", { description: "brain" });
    const found = discoverSkills(home);
    const b = found.find((s) => s.name === "brainstorming");
    expect(b).toBeDefined();
    expect(b!.source).toBe("plugin");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("discovers ~/.codex/skills and ~/.agents/skills", () => {
  const home = makeFakeHome();
  try {
    const codexSkills = join(home, ".codex/skills");
    const agentsSkills = join(home, ".agents/skills");
    mkdirSync(codexSkills, { recursive: true });
    mkdirSync(agentsSkills, { recursive: true });
    writeSkill(codexSkills, "cx", {});
    writeSkill(agentsSkills, "ag", {});
    const found = discoverSkills(home);
    const cx = found.find((s) => s.name === "cx")!;
    const ag = found.find((s) => s.name === "ag")!;
    expect(cx.source).toBe("user_codex");
    expect(ag.source).toBe("user_agents");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
