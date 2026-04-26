const RULES: Array<[RegExp, string]> = [
  [/^claude-/i, "Claude"],
  [/^gpt-/i, "GPT"],
  [/^qwen/i, "Qwen"],
  [/^glm-/i, "GLM"],
  [/^kimi/i, "Kimi"],
  [/^MiniMax-/i, "MiniMax"],
];

export function inferFamily(modelName: string): string {
  for (const [re, family] of RULES) {
    if (re.test(modelName)) return family;
  }
  return "Other";
}
