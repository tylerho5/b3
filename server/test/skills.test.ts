import { test, expect } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
  lstatSync,
  readlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverSkills, compareVersions, type SkillBundle } from "../src/skills/registry";
import { materializeSkills } from "../src/skills/materialize";

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

function makeBundle(
  rootDir: string,
  name: string,
  body = "Body.",
  extra?: Record<string, string>,
): SkillBundle {
  const dir = join(rootDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: d\n---\n\n${body}`,
  );
  if (extra) {
    for (const [rel, content] of Object.entries(extra)) {
      const p = join(dir, rel);
      mkdirSync(join(p, ".."), { recursive: true });
      writeFileSync(p, content);
    }
  }
  return {
    id: `user_claude:${name}`,
    name,
    description: "d",
    source: "user_claude",
    sourceLabel: "user",
    path: dir,
  };
}

test("materializeSkills(copy) creates SKILL.md in both .claude/skills and .agents/skills", async () => {
  const home = makeFakeHome();
  try {
    const src = join(home, "src");
    mkdirSync(src, { recursive: true });
    const b = makeBundle(src, "alpha", "alpha body");
    const workdir = join(home, "workdir");
    mkdirSync(workdir, { recursive: true });
    await materializeSkills(workdir, [b], "copy");
    const claudeMd = join(workdir, ".claude/skills/alpha/SKILL.md");
    const agentsMd = join(workdir, ".agents/skills/alpha/SKILL.md");
    expect(existsSync(claudeMd)).toBe(true);
    expect(existsSync(agentsMd)).toBe(true);
    expect(readFileSync(claudeMd, "utf-8")).toContain("alpha body");
    expect(lstatSync(claudeMd).isSymbolicLink()).toBe(false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("materializeSkills(copy) preserves multi-file structure", async () => {
  const home = makeFakeHome();
  try {
    const src = join(home, "src");
    mkdirSync(src, { recursive: true });
    const b = makeBundle(src, "multi", "body", {
      "scripts/foo.sh": "#!/bin/bash\necho hi\n",
      "ref/notes.md": "# notes",
    });
    const workdir = join(home, "workdir");
    mkdirSync(workdir, { recursive: true });
    await materializeSkills(workdir, [b], "copy");
    expect(
      existsSync(join(workdir, ".claude/skills/multi/scripts/foo.sh")),
    ).toBe(true);
    expect(
      existsSync(join(workdir, ".agents/skills/multi/ref/notes.md")),
    ).toBe(true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("materializeSkills(symlink) creates symlinks", async () => {
  const home = makeFakeHome();
  try {
    const src = join(home, "src");
    mkdirSync(src, { recursive: true });
    const b = makeBundle(src, "linky");
    const workdir = join(home, "workdir");
    mkdirSync(workdir, { recursive: true });
    await materializeSkills(workdir, [b], "symlink");
    const claudePath = join(workdir, ".claude/skills/linky");
    const agentsPath = join(workdir, ".agents/skills/linky");
    expect(lstatSync(claudePath).isSymbolicLink()).toBe(true);
    expect(lstatSync(agentsPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(claudePath)).toBe(b.path);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("deduplicates plugin skills across versions, keeping highest", () => {
  const home = makeFakeHome();
  try {
    // Two versions of the same plugin skill — only 5.0.7 should survive.
    const newSkillsDir = join(
      home,
      ".claude/plugins/cache/superpowers/5.0.7/skills",
    );
    const oldSkillsDir = join(
      home,
      ".claude/plugins/cache/superpowers/4.1.1/skills",
    );
    mkdirSync(newSkillsDir, { recursive: true });
    mkdirSync(oldSkillsDir, { recursive: true });
    writeSkill(newSkillsDir, "foo", { description: "new foo" });
    writeSkill(oldSkillsDir, "foo", { description: "old foo" });
    const found = discoverSkills(home);
    const foos = found.filter((s) => s.name === "foo");
    expect(foos).toHaveLength(1);
    expect(foos[0].description).toBe("new foo");
    expect(foos[0].pluginVersion).toBe("5.0.7");
    expect(foos[0].pluginName).toBe("superpowers");
    expect(foos[0].id).toBe("plugin:superpowers:foo");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("compareVersions: numeric segments, missing segments, 'unknown'", () => {
  expect(compareVersions("5.0.7", "4.1.1")).toBeGreaterThan(0);
  expect(compareVersions("4.1.1", "5.0.7")).toBeLessThan(0);
  expect(compareVersions("1.0", "1.0.0")).toBe(0);
  expect(compareVersions("2.0", "1.9.9")).toBeGreaterThan(0);
  // missing segments treated as 0
  expect(compareVersions("1", "1.0")).toBe(0);
  expect(compareVersions("1.10", "1.9")).toBeGreaterThan(0);
  // v-prefix
  expect(compareVersions("v2.0.0", "1.9.9")).toBeGreaterThan(0);
  // "unknown" is lowest
  expect(compareVersions("unknown", "0.0.1")).toBeLessThan(0);
  expect(compareVersions("1.0.0", "unknown")).toBeGreaterThan(0);
  expect(compareVersions("unknown", "unknown")).toBe(0);
});

test("name collision throws before copying anything", async () => {
  const home = makeFakeHome();
  try {
    const src = join(home, "src");
    mkdirSync(src, { recursive: true });
    const b1 = makeBundle(src, "dup");
    const src2 = join(home, "src2");
    mkdirSync(src2, { recursive: true });
    const b2: SkillBundle = { ...makeBundle(src2, "dup"), source: "plugin" };
    const workdir = join(home, "workdir");
    mkdirSync(workdir, { recursive: true });
    await expect(materializeSkills(workdir, [b1, b2], "copy")).rejects.toThrow(
      /collision/i,
    );
    expect(existsSync(join(workdir, ".claude/skills/dup"))).toBe(false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
