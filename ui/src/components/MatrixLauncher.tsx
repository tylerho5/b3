import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type {
  Harness,
  ProviderConfig,
  SkillBundle,
  Task,
} from "../types/shared";
import { Chip } from "./ChipFilter";

const PER_COMBO_S = 60;

export function MatrixLauncher({
  onLaunched,
}: {
  onLaunched: (matrixRunId: string) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [skills, setSkills] = useState<SkillBundle[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [harnessSel, setHarnessSel] = useState<Set<Harness>>(
    new Set(["claude_code"]),
  );
  const [providerSel, setProviderSel] = useState<Set<string>>(new Set());
  const [modelSel, setModelSel] = useState<Set<string>>(new Set());
  const [skillSel, setSkillSel] = useState<Set<string>>(new Set());
  const [concurrency, setConcurrency] = useState(4);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api.listTasks(),
      api.getProviders(),
      api.getSkills(),
    ]).then(([t, p, s]) => {
      setTasks(t);
      setProviders(p.providers);
      setSkills(s);
      if (t.length && !taskId) setTaskId(t[0].id);
    });
  }, []);

  const filteredProviders = useMemo(
    () => providers.filter((p) => harnessSel.has(p.harness)),
    [providers, harnessSel],
  );
  const filteredModels = useMemo(() => {
    const out: { providerId: string; modelId: string; harness: Harness }[] = [];
    for (const p of filteredProviders) {
      if (!providerSel.has(p.id)) continue;
      for (const m of p.models) {
        out.push({ providerId: p.id, modelId: m.id, harness: p.harness });
      }
    }
    return out;
  }, [filteredProviders, providerSel]);

  const matrix = useMemo(() => {
    return filteredModels.filter((m) =>
      modelSel.has(modelKey(m.providerId, m.modelId)),
    );
  }, [filteredModels, modelSel]);

  const estS = matrix.length * PER_COMBO_S;
  const estLabel =
    estS < 60
      ? `~${estS}s`
      : `~${Math.round((estS / 60) * 10) / 10} min`;

  const launch = async () => {
    if (!taskId || matrix.length === 0) return;
    setLaunching(true);
    setError(null);
    try {
      const r = await api.launch({
        taskId,
        matrix: matrix.map((m) => ({
          harness: m.harness,
          providerId: m.providerId,
          modelId: m.modelId,
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
    <div className="launcher">
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
            key={`${p.harness}:${p.id}`}
            active={providerSel.has(p.id)}
            onClick={() => toggle(setProviderSel, p.id)}
            title={p.label}
          >
            {p.id}
          </Chip>
        ))}
        {filteredProviders.length === 0 && (
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
            (no providers for selected harness)
          </span>
        )}
      </div>

      <div className="launcher-row">
        <span className="launcher-label">models</span>
        {filteredModels.map((m) => {
          const key = modelKey(m.providerId, m.modelId);
          return (
            <Chip
              key={key}
              active={modelSel.has(key)}
              onClick={() => toggle(setModelSel, key)}
              title={`${m.providerId} • ${m.modelId}`}
            >
              {m.modelId}
            </Chip>
          );
        })}
        {filteredModels.length === 0 && (
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
            (pick providers first)
          </span>
        )}
      </div>

      <div className="launcher-row">
        <span className="launcher-label">skills</span>
        {skills.map((s) => (
          <Chip
            key={s.id}
            active={skillSel.has(s.id)}
            onClick={() => toggle(setSkillSel, s.id)}
            title={`${s.sourceLabel} — ${s.description}`}
          >
            {s.name}
          </Chip>
        ))}
        {skills.length === 0 && (
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
            (no skills discovered)
          </span>
        )}
      </div>

      <div className="launcher-row">
        <span className="launcher-label">concurrency</span>
        <input
          type="number"
          min={1}
          max={16}
          value={concurrency}
          onChange={(e) =>
            setConcurrency(Math.max(1, Math.min(16, Number(e.target.value))))
          }
          style={{ width: 80, minWidth: 0 }}
        />
        <span className="launcher-summary">
          {matrix.length} combo{matrix.length === 1 ? "" : "s"} → {estLabel}{" "}
          wall-clock (assuming {PER_COMBO_S}s/combo, capped at concurrency)
        </span>
        <div className="launcher-actions">
          <button
            type="button"
            className="primary"
            onClick={launch}
            disabled={launching || !taskId || matrix.length === 0}
          >
            ▶ run
          </button>
        </div>
      </div>

      {error && (
        <div className="refiner-error">{error}</div>
      )}
    </div>
  );
}

function modelKey(providerId: string, modelId: string) {
  return `${providerId}::${modelId}`;
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
