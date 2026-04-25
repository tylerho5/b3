import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { MatrixRun, Run } from "../types/shared";
import { MatrixLauncher } from "../components/MatrixLauncher";
import "../styles/runs.css";

export function Runs() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeCells, setActiveCells] = useState<Run[] | null>(null);
  const [history, setHistory] = useState<MatrixRun[]>([]);

  const refreshHistory = async () => {
    try {
      const list = await api.listMatrixRuns();
      setHistory(list);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void refreshHistory();
  }, []);

  useEffect(() => {
    if (!activeId) {
      setActiveCells(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await api.getMatrixRun(activeId);
        if (!cancelled) setActiveCells(r.cells);
      } catch {
        // ignore
      }
    };
    void tick();
    const i = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [activeId]);

  return (
    <div className="runs-page">
      <MatrixLauncher
        onLaunched={(id) => {
          setActiveId(id);
          void refreshHistory();
        }}
      />

      {activeId && (
        <ActiveMatrix
          matrixRunId={activeId}
          cells={activeCells ?? []}
          onClose={() => {
            setActiveId(null);
            void refreshHistory();
          }}
        />
      )}

      <section>
        <h3
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color: "var(--text-muted)",
            margin: "8px 0",
          }}
        >
          history
        </h3>
        {history.length === 0 ? (
          <div className="placeholder" style={{ padding: 20 }}>
            no runs yet
          </div>
        ) : (
          <div className="history-list">
            {history.map((m) => (
              <div
                className="history-row"
                key={m.id}
                onClick={() => setActiveId(m.id)}
              >
                <div>
                  <strong>{new Date(m.startedAt).toLocaleString()}</strong>
                  <span style={{ marginLeft: 8, color: "var(--text-muted)" }}>
                    {m.id}
                  </span>
                </div>
                <div style={{ color: "var(--text-secondary)" }}>{m.status}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ActiveMatrix({
  matrixRunId,
  cells,
  onClose,
}: {
  matrixRunId: string;
  cells: Run[];
  onClose: () => void;
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <strong style={{ fontSize: 13 }}>matrix {matrixRunId}</strong>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
          {cells.length} cell{cells.length === 1 ? "" : "s"}
        </span>
        <div style={{ marginLeft: "auto" }}>
          <button
            type="button"
            className="secondary"
            onClick={onClose}
          >
            done
          </button>
        </div>
      </div>
      <div className="placeholder" style={{ padding: 20 }}>
        live session cards arrive in Task 7.5
      </div>
    </section>
  );
}
