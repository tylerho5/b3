import { test, expect } from "bun:test";
import { refineTask, RefinerParseError } from "../src/refiner/refine";

function probeClaude(): boolean {
  try {
    const r = Bun.spawnSync(["claude", "--version"]);
    return r.exitCode === 0;
  } catch {
    return false;
  }
}
const HAVE_CLAUDE = probeClaude() && !process.env.B3_SKIP_CLI_TESTS;

test.skipIf(!HAVE_CLAUDE)(
  "refineTask returns valid RefinedTask",
  async () => {
    const result = await refineTask({
      draft:
        "agent should fix an off-by-one in a python pagination function called get_page",
    });
    expect(result.name.length).toBeGreaterThan(0);
    expect(result.name.length).toBeLessThanOrEqual(80);
    expect(result.prompt.length).toBeGreaterThan(0);
    expect(typeof result.test_command).toBe("string");
    expect(typeof result.base_repo_setup).toBe("string");
    expect(typeof result.notes).toBe("string");
  },
  120_000,
);

test.skipIf(!HAVE_CLAUDE)(
  "refineTask honors B3_REFINER_MODEL",
  async () => {
    process.env.B3_REFINER_MODEL = "claude-haiku-4-5";
    try {
      const result = await refineTask({ draft: "make a TODO list app" });
      expect(result.name.length).toBeGreaterThan(0);
    } finally {
      delete process.env.B3_REFINER_MODEL;
    }
  },
  120_000,
);

test("RefinerParseError type carries raw text", () => {
  const err = new RefinerParseError("bad json", "<<not-json>>");
  expect(err.raw).toBe("<<not-json>>");
  expect(err.message).toBe("bad json");
});
