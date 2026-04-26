import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type {
  MatrixRun,
  Provider,
  Run,
  RunStatus,
} from "../types/shared";
import { providerPricingMode } from "../launcher/pricing";
import { MatrixLauncher } from "../components/MatrixLauncher";
import { SessionCard } from "../components/SessionCard";
import { BroadcastBar } from "../components/BroadcastBar";
import { MatrixGrid, type CellRunState } from "../components/MatrixGrid";
import { useEvents } from "../hooks/useEvents";
import "../styles/runs.css";

export function Runs() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeCells, setActiveCells] = useState<Run[] | null>(null);
  const [history, setHistory] = useState<MatrixRun[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(
    new Set(),
  );

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
    void api.listProviders().then((p) => setProviders(p.providers));
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
          setSelectedRunIds(new Set());
          void refreshHistory();
        }}
      />

      {activeId && (
        <ActiveMatrix
          matrixRunId={activeId}
          cells={activeCells ?? []}
          providers={providers}
          selected={selectedRunIds}
          onToggleSelect={(id) =>
            setSelectedRunIds((s) => {
              const next = new Set(s);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
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
  providers,
  selected,
  onToggleSelect,
  onClose,
}: {
  matrixRunId: string;
  cells: Run[];
  providers: Provider[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onClose: () => void;
}) {
  const stream = useEvents(matrixRunId);
  const pricingByProvider = (id: string) => {
    const p = providers.find((q) => q.id === id);
    return p ? providerPricingMode(p.kind) : "unknown";
  };

  const gridState = useMemo<Record<string, CellRunState>>(() => {
    const out: Record<string, CellRunState> = {};
    for (const c of cells) out[c.id] = mapRunStatus(c.status);
    return out;
  }, [cells]);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <strong style={{ fontSize: 13 }}>matrix {matrixRunId}</strong>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
          {cells.length} cell{cells.length === 1 ? "" : "s"} ·{" "}
          {stream.connected ? "live" : "(reconnecting…)"}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              void api.cancel(matrixRunId);
            }}
          >
            cancel
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            close
          </button>
        </div>
      </div>
      {cells.length > 0 && (
        <MatrixGrid mode="live" runs={cells} state={gridState} />
      )}
      <BroadcastBar
        matrixRunId={matrixRunId}
        selectedCount={selected.size}
        onSent={() => {
          // no-op; events arrive via WS
        }}
      />
      <div className="cards-grid">
        {cells.map((c) => (
          <SessionCard
            key={c.id}
            run={c}
            events={stream.byRunId[c.id] ?? []}
            selected={selected.has(c.id)}
            onSelect={() => onToggleSelect(c.id)}
            onSendMessage={(text) =>
              api.sendMessage(matrixRunId, c.id, text)
            }
            pricingMode={pricingByProvider(c.providerId)}
          />
        ))}
      </div>
    </section>
  );
}

function mapRunStatus(status: RunStatus): CellRunState {
  switch (status) {
    case "running":
    case "testing":
      return "running";
    case "passed":
      return "success";
    case "failed":
    case "error":
    case "canceled":
      return "error";
    case "pending":
    default:
      return "pending";
  }
}
