import { test, expect } from "bun:test";
import { inferFamily } from "./inferFamily";

test("claude- prefix → Claude", () => {
  expect(inferFamily("claude-sonnet-4-6")).toBe("Claude");
  expect(inferFamily("claude-opus-4-7")).toBe("Claude");
  expect(inferFamily("claude-haiku-4-5")).toBe("Claude");
});

test("gpt- prefix → GPT", () => {
  expect(inferFamily("gpt-5.4")).toBe("GPT");
  expect(inferFamily("gpt-4o")).toBe("GPT");
});

test("qwen prefix → Qwen", () => {
  expect(inferFamily("qwen3-coder-next")).toBe("Qwen");
  expect(inferFamily("qwen3-max-2026-01-23")).toBe("Qwen");
  expect(inferFamily("Qwen2-VL")).toBe("Qwen");
});

test("glm- prefix → GLM", () => {
  expect(inferFamily("glm-5")).toBe("GLM");
  expect(inferFamily("glm-4.7")).toBe("GLM");
});

test("kimi prefix → Kimi", () => {
  expect(inferFamily("kimi-k2")).toBe("Kimi");
  expect(inferFamily("kimi-latest")).toBe("Kimi");
});

test("MiniMax- prefix → MiniMax", () => {
  expect(inferFamily("MiniMax-Text-01")).toBe("MiniMax");
});

test("unrecognized prefix → Other", () => {
  expect(inferFamily("deepseek-coder")).toBe("Other");
  expect(inferFamily("llama-3.3")).toBe("Other");
  expect(inferFamily("unknown-model")).toBe("Other");
});
