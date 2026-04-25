import { useState } from "react";
import { api } from "../api/client";

export function BroadcastBar({
  matrixRunId,
  selectedCount,
  onSent,
}: {
  matrixRunId: string;
  selectedCount: number;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"wait" | "immediate">("wait");
  const [target, setTarget] = useState<"all" | "selected">("all");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!text.trim()) return;
    if (target === "selected") {
      // Selected-target with multiple sessions is implemented as parallel
      // per-session messages from the parent; this bar covers the matrix-wide
      // case. Per-session input lives on each card.
      // We still route to broadcast immediate mode here for "all" only;
      // to keep UX simple the "selected" mode is a placeholder hint.
    }
    setSending(true);
    setError(null);
    try {
      await api.broadcast(matrixRunId, text, mode);
      setText("");
      onSent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="broadcast-bar">
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>broadcast</span>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="type to broadcast to all sessions…"
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
      />
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as typeof mode)}
        style={{ minWidth: 0 }}
      >
        <option value="wait">wait (deliver at next segment_end)</option>
        <option value="immediate">immediate</option>
      </select>
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value as typeof target)}
        style={{ minWidth: 0 }}
        title={
          selectedCount === 0
            ? "select cards by clicking them to use 'selected'"
            : `${selectedCount} selected`
        }
      >
        <option value="all">all</option>
        <option value="selected" disabled={selectedCount === 0}>
          selected ({selectedCount})
        </option>
      </select>
      <button
        type="button"
        className="primary"
        onClick={submit}
        disabled={sending || !text.trim()}
      >
        {sending ? "sending…" : "send"}
      </button>
      {error && (
        <span style={{ color: "var(--error)", fontSize: 11 }}>{error}</span>
      )}
    </div>
  );
}
