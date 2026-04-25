import { useMemo } from "react";
import type { NormalizedEvent } from "../types/shared";

const WINDOW_S = 60;

export interface DerivedSeries {
  tokensPerSec: number[];
  toolCallsPerTick: number[];
  toolNames: string[];
  latestSkill: string | null;
  latestTail: string | null;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  turns: number;
  hasSegmentEnd: boolean;
}

export function useDerivedSeries(
  events: NormalizedEvent[] | undefined,
  now: number = Date.now(),
): DerivedSeries {
  return useMemo(() => {
    const tokens = new Array(WINDOW_S).fill(0) as number[];
    const calls = new Array(WINDOW_S).fill(0) as number[];
    const tools: string[] = [];
    let latestSkill: string | null = null;
    let latestTail: string | null = null;
    let inputTokens = 0;
    let outputTokens = 0;
    let cost = 0;
    let turns = 0;
    let hasSegmentEnd = false;

    if (!events || events.length === 0) {
      return {
        tokensPerSec: tokens,
        toolCallsPerTick: calls,
        toolNames: tools,
        latestSkill,
        latestTail,
        inputTokens,
        outputTokens,
        cost,
        turns,
        hasSegmentEnd,
      };
    }

    for (const e of events) {
      const bucket = Math.max(
        0,
        Math.min(WINDOW_S - 1, WINDOW_S - 1 - Math.floor((now - e.ts) / 1000)),
      );
      if (e.t === "usage") {
        tokens[bucket] += e.input + e.output;
        inputTokens += e.input;
        outputTokens += e.output;
        if (typeof e.costUsd === "number") cost += e.costUsd;
      }
      if (e.t === "tool_call") {
        calls[bucket] += 1;
        tools.push(e.toolName);
        latestTail = `${e.toolName}: ${e.argsPreview}`;
      }
      if (e.t === "skill_invoked") {
        latestSkill = e.skillName;
      }
      if (e.t === "turn_start") {
        turns++;
      }
      if (e.t === "assistant_text") {
        latestTail = e.textDelta.split("\n")[0].slice(0, 120);
      }
      if (e.t === "segment_end") {
        hasSegmentEnd = true;
      }
    }

    return {
      tokensPerSec: tokens,
      toolCallsPerTick: calls,
      toolNames: tools.slice(-12),
      latestSkill,
      latestTail,
      inputTokens,
      outputTokens,
      cost,
      turns,
      hasSegmentEnd,
    };
  }, [events, now]);
}
