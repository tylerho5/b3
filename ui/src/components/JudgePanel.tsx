import { useState } from "react";
import { api } from "../api/client";
import type { Run } from "../types/shared";

export function JudgePanel({
  matrixRunId,
  run,
}: {
  matrixRunId: string;
  run: Run;
}) {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState(run.judgeScore ?? 3);
  const [notes, setNotes] = useState(run.judgeNotes ?? "");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    try {
      const r = await api.judgePrompt(matrixRunId, run.id);
      setPrompt(r.prompt);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
  };

  const submit = async () => {
    await api.submitJudge(matrixRunId, run.id, score, notes);
    setSavedAt(new Date().toLocaleTimeString());
  };

  return (
    <div className="run-detail-section judge-panel">
      <h3>judge</h3>
      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={generate}
          disabled={loading}
        >
          {loading ? "generating…" : "generate prompt"}
        </button>
        {prompt && (
          <button type="button" className="secondary" onClick={copy}>
            copy
          </button>
        )}
      </div>
      {prompt && <pre style={{ marginTop: 8 }}>{prompt}</pre>}

      <div style={{ marginTop: 14 }}>
        <label
          style={{
            fontSize: 12,
            color: "var(--accent)",
            display: "block",
            marginBottom: 4,
          }}
        >
          notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="paste your judgment back here…"
        />
      </div>
      <div className="row">
        <label style={{ fontSize: 12 }}>score</label>
        <select
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button type="button" className="primary" onClick={submit}>
          save
        </button>
        {savedAt && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            saved at {savedAt}
          </span>
        )}
      </div>
    </div>
  );
}
