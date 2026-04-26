import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type {
  Harness,
  MatrixRun,
  Provider,
  ProviderModel,
  Run,
  RunStatus,
  SkillBundle,
  Task,
} from "../types/shared";
import { providerPricingMode } from "../launcher/pricing";
import { SessionCard } from "../components/SessionCard";
import { BroadcastBar } from "../components/BroadcastBar";
import { MatrixGrid, type CellRunState } from "../components/MatrixGrid";
import { AddModelsPopover } from "../components/AddModelsPopover";
import { SkillPicker } from "../components/SkillPicker/Picker";
import { useEvents } from "../hooks/useEvents";
import { useMatrixSelection, cellKey } from "../hooks/useMatrixSelection";
import { useRecents } from "../hooks/useRecents";
import { useRoutePins } from "../hooks/useRoutePins";
import { resolveRoute } from "../lib/resolveRoute";
import "../styles/runs.css";
import "../styles/skill-picker.css";

export function Runs() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([]);
  const [skills, setSkills] = useState<SkillBundle[]>([]);
  const [history, setHistory] = useState<MatrixRun[]>([]);

  const [taskId, setTaskId] = useState<string | null>(null);
  const [skillSel, setSkillSel] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeData, setActiveData] = useState<{
    matrixRun: MatrixRun;
    cells: Run[];
  } | null>(null);
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set());
  const [addModelsOpen, setAddModelsOpen] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { models, cells, addModel, removeModel, toggleCell, swapRoute, removeAll } =
    useMatrixSelection();
  const { recents, recordUse } = useRecents();
  const { pins, setPin } = useRoutePins();

  const refreshHistory = async () => {
    try {
      const list = await api.listMatrixRuns();
      setHistory(list);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void Promise.all([
      api.listTasks(),
      api.listProviders(),
      api.getSkills(),
    ]).then(([t, p, s]) => {
      setTasks(t);
      setProviders(p.providers);
      setProviderModels(p.models);
      setSkills(s);
      if (t.length && !taskId) setTaskId(t[0].id);
    });
    void refreshHistory();
  }, []);

  // Poll active matrix run
  useEffect(() => {
    if (!activeId) {
      setActiveData(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await api.getMatrixRun(activeId);
        if (!cancelled) setActiveData(r);
      } catch {
        // ignore
      }
    };
    void tick();
    const interval = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeId]);

  const isRunning = activeData?.matrixRun.status === "running";
  const activeCells = activeData?.cells ?? [];

  const checkedCount = useMemo(
    () => Object.values(cells).filter((c) => c.checked).length,
    [cells],
  );

  const launchMatrix = useMemo(() => {
    const result: Array<{ harness: Harness; providerId: string; modelId: string }> = [];
    const harnesses: Harness[] = ["claude_code", "codex"];
    for (const modelName of models) {
      for (const harness of harnesses) {
        const k = cellKey(modelName, harness);
        const cellState = cells[k];
        if (!cellState?.checked) continue;
        const routeId =
          cellState.routeOverride ??
          resolveRoute({ modelName, harness, providers, providerModels, pins });
        if (!routeId) continue;
        result.push({ harness, providerId: routeId, modelId: modelName });
      }
    }
    return result;
  }, [models, cells, providers, providerModels, pins]);

  const handleLaunch = async () => {
    if (!taskId || launchMatrix.length === 0) return;
    setLaunching(true);
    setError(null);
    try {
      const r = await api.launch({
        taskId,
        matrix: launchMatrix,
        skillIds: Array.from(skillSel),
      });
      setActiveId(r.matrixRunId);
      setSelectedRunIds(new Set());
      void refreshHistory();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLaunching(false);
    }
  };

  const selectedModels = useMemo(() => new Set(models), [models]);

  const addModelAndRecord = (modelName: string, harnesses: Harness[]) => {
    addModel(modelName, harnesses);
    recordUse(modelName);
  };

  const addModelsAnchorRef = useRef<HTMLDivElement>(null);

  const gridState = useMemo<Record<string, CellRunState>>(() => {
    const out: Record<string, CellRunState> = {};
    for (const c of activeCells) out[c.id] = mapRunStatus(c.status);
    return out;
  }, [activeCells]);

  return (
    <div className="runs-page">
      {/* ── Configurator panel ─────────────────────────── */}
      <div className="config-panel">
        {/* Task row */}
        <div className="config-task-row">
          <label htmlFor="task-select">task</label>
          <select
            id="task-select"
            value={taskId ?? ""}
            onChange={(e) => setTaskId(e.target.value || null)}
            disabled={isRunning}
          >
            <option value="">— select —</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Matrix header */}
        <div className="config-section-header">
          <span className="config-section-label">matrix</span>
          <div className="config-section-actions">
            {!isRunning && (
              <div className="add-models-anchor" ref={addModelsAnchorRef}>
                <button
                  type="button"
                  className="secondary"
                  style={{ fontSize: 11 }}
                  onClick={() => setAddModelsOpen((v) => !v)}
                >
                  + add models
                </button>
                {addModelsOpen && (
                  <AddModelsPopover
                    providers={providers}
                    providerModels={providerModels}
                    pins={pins}
                    recents={recents}
                    selectedModels={selectedModels}
                    onAdd={addModelAndRecord}
                    onRemove={removeModel}
                    onClose={() => setAddModelsOpen(false)}
                  />
                )}
              </div>
            )}
            {isRunning ? (
              <button
                type="button"
                className="danger"
                style={{ fontSize: 11 }}
                onClick={() => {
                  if (activeId) void api.cancel(activeId);
                }}
              >
                ■ stop
              </button>
            ) : (
              <button
                type="button"
                className="primary"
                style={{ fontSize: 11 }}
                disabled={launching || !taskId || checkedCount === 0}
                onClick={handleLaunch}
              >
                ▶ run
              </button>
            )}
          </div>
        </div>

        {/* Matrix body */}
        <div className="config-matrix-body">
          {isRunning ? (
            <MatrixGrid
              mode="live"
              runs={activeCells}
              state={gridState}
            />
          ) : (
            <MatrixGrid
              mode="configure"
              models={models}
              cells={cells}
              providers={providers}
              providerModels={providerModels}
              pins={pins}
              onToggleCell={toggleCell}
              onSwapRoute={swapRoute}
              onPinRoute={setPin}
              onRemoveModel={removeModel}
              onRemoveAll={removeAll}
            />
          )}
        </div>

        {/* Skills strip */}
        <div className="config-skills-strip">
          <span className="config-section-label">skills</span>
          <SkillPicker
            skills={skills}
            selected={skillSel}
            onChange={setSkillSel}
          />
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            background: "rgba(220,53,69,0.10)",
            border: "1px solid rgba(220,53,69,0.30)",
            color: "var(--error)",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* ── Active run area ─────────────────────────────── */}
      {activeId && activeCells.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <BroadcastBar
            matrixRunId={activeId}
            selectedCount={selectedRunIds.size}
            onSent={() => {}}
          />
          <RunCards
            matrixRunId={activeId}
            cells={activeCells}
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
          />
        </section>
      )}

      {/* ── History ─────────────────────────────────────── */}
      <section>
        <h3
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color: "var(--text-muted)",
            margin: "4px 0 8px",
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

function RunCards({
  matrixRunId,
  cells,
  providers,
  selected,
  onToggleSelect,
}: {
  matrixRunId: string;
  cells: Run[];
  providers: Provider[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const stream = useEvents(matrixRunId);
  const pricingByProvider = (id: string) => {
    const p = providers.find((q) => q.id === id);
    return p ? providerPricingMode(p.kind) : "unknown";
  };
  return (
    <div className="cards-grid">
      {cells.map((c) => (
        <SessionCard
          key={c.id}
          run={c}
          events={stream.byRunId[c.id] ?? []}
          selected={selected.has(c.id)}
          onSelect={() => onToggleSelect(c.id)}
          onSendMessage={(text) => api.sendMessage(matrixRunId, c.id, text)}
          pricingMode={pricingByProvider(c.providerId)}
        />
      ))}
    </div>
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
    default:
      return "pending";
  }
}
