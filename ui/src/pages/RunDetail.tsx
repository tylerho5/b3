import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type {
  Run,
  RunSegment,
  Task,
} from "../types/shared";
import { Transcript } from "../components/Transcript";
import { DiffView } from "../components/DiffView";
import { JudgePanel } from "../components/JudgePanel";
import "../styles/runDetail.css";

interface Detail {
  run: Run;
  segments: RunSegment[];
  events: { id: number; type: string; tsMs: number; payload: unknown }[];
  diff: string | null;
  meta: unknown;
  testLog: string | null;
}

export function RunDetail() {
  const { matrixId, runId } = useParams<{
    matrixId: string;
    runId: string;
  }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!matrixId || !runId) return;
    let cancelled = false;
    void (async () => {
      try {
        const d = (await api.getRunDetail(matrixId, runId)) as Detail;
        if (!cancelled) setDetail(d);
        const m = await api.getMatrixRun(matrixId);
        if (cancelled) return;
        const t = await api.getTask(m.matrixRun.taskId).catch(() => null);
        if (!cancelled) setTask(t);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matrixId, runId]);

  if (error) {
    return (
      <div className="placeholder" style={{ padding: 24 }}>
        {error}
      </div>
    );
  }
  if (!detail || !matrixId || !runId) {
    return <div className="placeholder">loading…</div>;
  }
  const { run, segments, events, diff, testLog } = detail;

  return (
    <div className="run-detail">
      <div className="run-detail-left">
        <h2>
          <Link to="/runs" style={{ color: "var(--text-muted)" }}>
            ← runs
          </Link>{" "}
          {run.harness} · {run.modelId}
        </h2>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 12,
          }}
        >
          status: <strong>{run.status}</strong>
          {run.testsPassed != null && (
            <>
              {" · tests: "}
              <strong>{run.testsPassed ? "passed" : "failed"}</strong>
            </>
          )}
          {" · "}in {fmtTokens(run.inputTokens)} / out{" "}
          {fmtTokens(run.outputTokens)} · turns {run.turns}
        </div>
        <Transcript
          segments={segments}
          events={events}
          taskPrompt={task?.prompt ?? ""}
        />
      </div>
      <div className="run-detail-right">
        <div className="run-detail-section">
          <h3>diff</h3>
          <DiffView diff={diff} />
        </div>
        <div className="run-detail-section">
          <h3>test log</h3>
          {testLog ? (
            <pre className="diff-view">{testLog}</pre>
          ) : (
            <div className="placeholder" style={{ padding: 12 }}>
              no test log
            </div>
          )}
        </div>
        <JudgePanel matrixRunId={matrixId} run={run} />
      </div>
    </div>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1000) return `${Math.round((n / 1000) * 10) / 10}k`;
  return String(n);
}
