import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type {
  Harness,
  MatrixEstimate,
  Provider,
  ProviderModel,
  SkillBundle,
  Task,
} from "../types/shared";
import { Chip } from "./ChipFilter";
import { SkillPicker } from "./SkillPicker/Picker";
import {
  harnessesForKind,
  kindSupportsHarness,
  modelSelectionKey,
  resolveCells,
} from "../launcher/resolveCells";
import "../styles/skill-picker.css";
import "../styles/launcher.css";

export function MatrixLauncher({
  onLaunched,
}: {
  onLaunched: (matrixRunId: string) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([]);
  const [skills, setSkills] = useState<SkillBundle[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [harnessSel, setHarnessSel] = useState<Set<Harness>>(
    new Set(["claude_code"]),
  );
  const [providerSel, setProviderSel] = useState<Set<string>>(new Set());
  const [modelSel, setModelSel] = useState<Set<string>>(new Set());
  const [skillSel, setSkillSel] = useState<Set<string>>(new Set());
  const [removedCells, setRemovedCells] = useState<Set<string>>(new Set());
  const [concurrency, setConcurrency] = useState(4);
  const [estimate, setEstimate] = useState<MatrixEstimate | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  const filteredProviders = useMemo(
    () =>
      providers.filter((p) =>
        Array.from(harnessSel).some((h) => kindSupportsHarness(p.kind, h)),
      ),
    [providers, harnessSel],
  );

  const filteredModels = useMemo(() => {
    const visible = providerModels.filter((m) => providerSel.has(m.providerId));
    return visible;
  }, [providerModels, providerSel]);

  // Reset removed cells when upstream selections change so users can re-add by toggling.
  useEffect(() => {
    setRemovedCells(new Set());
  }, [harnessSel, providerSel, modelSel]);

  const allCells = useMemo(
    () =>
      resolveCells({
        harnessSel,
        providers,
        providerModels,
        providerSel,
        modelSel,
      }),
    [harnessSel, providers, providerModels, providerSel, modelSel],
  );

  const cells = useMemo(
    () => allCells.filter((c) => !removedCells.has(c.id)),
    [allCells, removedCells],
  );

  const warningCount = useMemo(
    () => cells.filter((c) => c.warning).length,
    [cells],
  );

  // Debounced estimate fetch.
  const estimateAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (cells.length === 0) {
      setEstimate(null);
      return;
    }
    estimateAbort.current?.abort();
    const ac = new AbortController();
    estimateAbort.current = ac;
    const triples = cells.map((c) => ({
      harness: c.harness,
      providerId: c.providerId,
      modelId: c.modelId,
    }));
    const handle = setTimeout(() => {
      void api
        .estimateRuns(triples)
        .then((r) => {
          if (!ac.signal.aborted) setEstimate(r);
        })
        .catch(() => {
          if (!ac.signal.aborted) setEstimate(null);
        });
    }, 200);
    return () => {
      clearTimeout(handle);
      ac.abort();
    };
  }, [cells]);

  const launch = async () => {
    if (!taskId || cells.length === 0) return;
    setLaunching(true);
    setError(null);
    try {
      const r = await api.launch({
        taskId,
        matrix: cells.map((c) => ({
          harness: c.harness,
          providerId: c.providerId,
          modelId: c.modelId,
        })),
        skillIds: Array.from(skillSel),
        concurrency,
      });
      onLaunched(r.matrixRunId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="launcher-shell">
      <div className="launcher launcher-form">
        <div className="launcher-row">
          <span className="launcher-label">task</span>
          <select
            value={taskId ?? ""}
            onChange={(e) => setTaskId(e.target.value || null)}
          >
            <option value="">— select —</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="launcher-row">
          <span className="launcher-label">harness</span>
          {(["claude_code", "codex"] as Harness[]).map((h) => (
            <Chip
              key={h}
              active={harnessSel.has(h)}
              onClick={() => toggle(setHarnessSel, h)}
            >
              {h}
            </Chip>
          ))}
        </div>

        <div className="launcher-row">
          <span className="launcher-label">providers</span>
          {filteredProviders.map((p) => (
            <Chip
              key={p.id}
              active={providerSel.has(p.id)}
              onClick={() => toggle(setProviderSel, p.id)}
              title={`${p.name} · ${p.kind} · ${harnessesForKind(p.kind).join(", ")}`}
            >
              {p.name}
            </Chip>
          ))}
          {filteredProviders.length === 0 && (
            <span className="launcher-empty">
              (no providers for selected harness)
            </span>
          )}
        </div>

        <div className="launcher-row">
          <span className="launcher-label">models</span>
          {filteredModels.map((m) => {
            const key = modelSelectionKey(m.providerId, m.modelId);
            const provider = providers.find((p) => p.id === m.providerId);
            return (
              <Chip
                key={key}
                active={modelSel.has(key)}
                onClick={() => toggle(setModelSel, key)}
                title={`${provider?.name ?? m.providerId} • ${m.modelId}`}
              >
                {m.modelId}
              </Chip>
            );
          })}
          {filteredModels.length === 0 && (
            <span className="launcher-empty">
              (pick providers first)
            </span>
          )}
        </div>

        <div className="launcher-row">
          <span className="launcher-label">skills</span>
          <SkillPicker
            skills={skills}
            selected={skillSel}
            onChange={setSkillSel}
          />
        </div>

        <div className="launcher-row">
          <span className="launcher-label">concurrency</span>
          <input
            type="number"
            min={1}
            max={16}
            value={concurrency}
            onChange={(e) =>
              setConcurrency(
                Math.max(1, Math.min(16, Number(e.target.value))),
              )
            }
            style={{ width: 80, minWidth: 0 }}
          />
        </div>

        {error && <div className="refiner-error">{error}</div>}
      </div>

      <aside className="launcher-side">
        <div className="launcher-side-head">matrix</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "4px 0" }}>
          {cells.length} cell{cells.length === 1 ? "" : "s"}
        </div>
        <MatrixLegend
          cells={cells}
          providers={providers}
          estimate={estimate}
          concurrency={concurrency}
        />
        {warningCount > 0 && (
          <div className="launcher-warning">
            {warningCount === 1
              ? "1 cell may have feature gaps under its harness — hover the ⚠ for details."
              : `${warningCount} cells may have feature gaps under their harness — hover the ⚠ for details.`}
          </div>
        )}
        <button
          type="button"
          className="primary launcher-run"
          onClick={launch}
          disabled={launching || !taskId || cells.length === 0}
        >
          ▶ run
        </button>
      </aside>
    </div>
  );
}

function MatrixLegend({
  cells,
  providers,
  estimate,
  concurrency,
}: {
  cells: ReturnType<typeof resolveCells>;
  providers: Provider[];
  estimate: MatrixEstimate | null;
  concurrency: number;
}) {
  const providerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cells) {
      counts.set(c.providerId, (counts.get(c.providerId) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([providerId, count]) => ({
        name:
          providers.find((p) => p.id === providerId)?.name ?? providerId,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [cells, providers]);

  const wallClock =
    estimate && estimate.cellsWithHistory > 0
      ? formatWallClock(
          Math.ceil(estimate.cellsWithHistory / concurrency) *
            estimate.medianMs,
        )
      : null;

  return (
    <div className="launcher-legend">
      <div className="launcher-legend-line">
        <strong>{cells.length}</strong> combo{cells.length === 1 ? "" : "s"}
      </div>
      {wallClock && (
        <div className="launcher-legend-line launcher-legend-wallclock">
          ~{wallClock} wall-clock
        </div>
      )}
      {providerCounts.length > 0 && (
        <div className="launcher-legend-line launcher-legend-providers">
          {providerCounts.map((p) => `${p.name}: ${p.count}`).join(" · ")}
        </div>
      )}
    </div>
  );
}

function formatWallClock(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = seconds / 60;
  if (minutes < 10) return `${Math.round(minutes * 10) / 10} min`;
  return `${Math.round(minutes)} min`;
}

function toggle<T>(
  setter: (fn: (s: Set<T>) => Set<T>) => void,
  value: T,
): void {
  setter((s) => {
    const next = new Set(s);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  });
}
