import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { NormalizedEvent, Run } from "../types/shared";
import { Sparkline } from "./Sparkline";
import { ToolStrip } from "./ToolStrip";
import { useDerivedSeries } from "../hooks/useDerivedSeries";

export function SessionCard({
  run,
  events,
  selected,
  onSelect,
  onSendMessage,
  pricingMode,
}: {
  run: Run;
  events: NormalizedEvent[];
  selected: boolean;
  onSelect: () => void;
  onSendMessage: (text: string) => Promise<void>;
  pricingMode: "per_token" | "subscription" | "unknown";
}) {
  const [now, setNow] = useState(Date.now());
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const series = useDerivedSeries(events, now);
  const startedAt = run.startedAt ? new Date(run.startedAt).getTime() : now;
  const elapsedS = Math.floor((now - startedAt) / 1000);
  const harnessClass = run.harness === "codex" ? "codex" : "claude_code";

  const cls = [
    "session-card",
    harnessClass,
    selected ? "selected" : "",
    run.status === "passed" ? "passed" : "",
    run.status === "failed" || run.status === "error" ? "failed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const send = async () => {
    if (!msg.trim()) return;
    setSending(true);
    try {
      await onSendMessage(msg);
      setMsg("");
    } finally {
      setSending(false);
    }
  };

  const costLabel =
    pricingMode === "per_token"
      ? `$${run.costUsd.toFixed(3)}`
      : pricingMode === "subscription"
        ? "subscription"
        : "—";

  return (
    <div className={cls} onClick={onSelect}>
      <div className="card-head">
        <Link
          to={`/runs/${run.matrixRunId}/${run.id}`}
          onClick={(e) => e.stopPropagation()}
          style={{ color: "inherit", textDecoration: "none" }}
        >
          {run.harness} · {run.modelId}
        </Link>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          <span className={`status-dot ${run.status}`}></span>
          {run.status} {elapsedS}s
        </span>
      </div>
      <div className="card-counters">
        turn {series.turns || run.turns} · {fmtK(run.inputTokens)}/
        {fmtK(run.outputTokens)} · {costLabel}
      </div>
      <div className="spark-row">
        <span>tokens/s</span>
        <Sparkline values={series.tokensPerSec} width={220} height={20} />
      </div>
      <div className="spark-row">
        <span>tool calls</span>
        <Sparkline values={series.toolCallsPerTick} width={220} height={20} />
      </div>
      <ToolStrip tools={series.toolNames} />
      {series.latestSkill && (
        <div className="skill-line">skills ▸ {series.latestSkill}</div>
      )}
      <div className="tail-line">{series.latestTail ?? "(idle)"}</div>
      <div
        className="card-message"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="message this session…"
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
        />
        <button
          type="button"
          className="secondary"
          onClick={send}
          disabled={sending || !msg.trim()}
        >
          send
        </button>
      </div>
    </div>
  );
}

function fmtK(n: number): string {
  if (n >= 1000) return `${Math.round((n / 1000) * 10) / 10}k`;
  return String(n);
}
