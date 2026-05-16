import { test, expect } from "bun:test";
import { encodeModelKey, parseModelKey, modelKeyLabel } from "./modelKey";

test("encodeModelKey: non-empty effort appends ::effort", () => {
  expect(encodeModelKey("claude-opus-4-7", "high")).toBe("claude-opus-4-7::high");
});

test("encodeModelKey: empty effort returns plain modelId", () => {
  expect(encodeModelKey("gpt-5.5", "")).toBe("gpt-5.5");
});

test("parseModelKey: effort-encoded key", () => {
  expect(parseModelKey("claude-opus-4-7::high")).toEqual({ modelId: "claude-opus-4-7", effort: "high" });
  expect(parseModelKey("claude-opus-4-7::low")).toEqual({ modelId: "claude-opus-4-7", effort: "low" });
  expect(parseModelKey("claude-opus-4-7::medium")).toEqual({ modelId: "claude-opus-4-7", effort: "medium" });
  expect(parseModelKey("claude-opus-4-7::xhigh")).toEqual({ modelId: "claude-opus-4-7", effort: "xhigh" });
});

test("parseModelKey: plain key returns empty effort", () => {
  expect(parseModelKey("gpt-5.5")).toEqual({ modelId: "gpt-5.5", effort: "" });
  expect(parseModelKey("anthropic/claude-sonnet-4-6")).toEqual({ modelId: "anthropic/claude-sonnet-4-6", effort: "" });
});

test("parseModelKey: model name that happens to contain :: but unknown effort", () => {
  expect(parseModelKey("some-model::foo")).toEqual({ modelId: "some-model::foo", effort: "" });
});

test("modelKeyLabel: shows effort with · separator", () => {
  expect(modelKeyLabel("claude-opus-4-7::high")).toBe("claude-opus-4-7 · high");
});

test("modelKeyLabel: plain key returns as-is", () => {
  expect(modelKeyLabel("gpt-5.5")).toBe("gpt-5.5");
});
