import "../styles/matrix-grid.css";
import type { Harness, Run } from "../types/shared";
import type { CellState } from "../hooks/useMatrixSelection";
import { cellKey } from "../hooks/useMatrixSelection";

export type CellRunState = "pending" | "running" | "success" | "error";

const ALL_HARNESSES: Harness[] = ["claude_code", "codex"];

const HARNESS_VAR: Record<Harness, string> = {
  claude_code: "cc",
  codex: "codex",
};

// ── Configure mode ──────────────────────────────────────────

interface ConfigureProps {
  mode: "configure";
  models: string[];
  cells: Record<string, CellState>;
  onToggleCell: (model: string, harness: Harness) => void;
  onRemoveModel: (model: string) => void;
  onConfigureModel?: (modelName: string) => void;
}

// ── Live mode ───────────────────────────────────────────────

interface LiveProps {
  mode: "live";
  runs: Run[];
  state: Record<string, CellRunState>;
  onCellClick?: (runId: string) => void;
}

export type MatrixGridProps = ConfigureProps | LiveProps;

export function MatrixGrid(props: MatrixGridProps) {
  if (props.mode === "configure") return <ConfigureGrid {...props} />;
  return <LiveGrid {...props} />;
}

// ── Configure grid ──────────────────────────────────────────

function ConfigureGrid({
  models,
  cells,
  onToggleCell,
  onRemoveModel,
  onConfigureModel,
}: Omit<ConfigureProps, "mode">) {
  if (models.length === 0) {
    return (
      <div className="mg-wrap">
        <div className="mg-rows">
          <div className="mg-empty">
            no models — click &nbsp;<strong>+ add models</strong>&nbsp; to begin
          </div>
        </div>
      </div>
    );
  }

  const sorted = [...models].sort((a, b) => a.localeCompare(b));

  return (
    <div className="mg-wrap">
      <div className="mg-rows">
        {sorted.map((modelName) => (
          <div key={modelName} className="mg-row">
            <div className="mg-row-left">
              <button
                type="button"
                className="mg-model-name"
                onClick={() => onConfigureModel?.(modelName)}
              >
                <span className="mg-model-name-text">
                  {modelName.length > 28 ? modelName.slice(0, 28) + "…" : modelName}
                </span>
                <span
                  className="mg-row-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveModel(modelName);
                  }}
                >
                  ×
                </span>
              </button>
            </div>
            <div className="mg-cells">
              {ALL_HARNESSES.map((harness) => {
                const key = cellKey(modelName, harness);
                const checked = cells[key]?.checked ?? false;
                const v = HARNESS_VAR[harness];
                return (
                  <div
                    key={harness}
                    className={`mg-cell mg-cell-${v}${checked ? " mg-cell-on" : " mg-cell-off"}`}
                    onClick={() => onToggleCell(modelName, harness)}
                  />
                );
              })}
            </div>
            <div />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Live grid ───────────────────────────────────────────────

function mapRunStatus(status: Run["status"]): CellRunState {
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

function LiveGrid({ runs, state, onCellClick }: Omit<LiveProps, "mode">) {
  if (runs.length === 0) {
    return (
      <div className="mg-wrap">
        <div className="mg-rows">
          <div className="mg-empty">no active runs</div>
        </div>
      </div>
    );
  }

  const models = Array.from(new Set(runs.map((r) => r.modelId)));
  const harnesses = Array.from(new Set(runs.map((r) => r.harness))) as Harness[];

  const runByCell = new Map<string, Run>();
  for (const r of runs) {
    runByCell.set(cellKey(r.modelId, r.harness), r);
  }

  const displayHarnesses = harnesses.length === 0 ? ALL_HARNESSES : harnesses;

  return (
    <div className="mg-wrap">
      <div className="mg-rows">
        {models.map((modelId) => (
          <div key={modelId} className="mg-row">
            <span className="mg-model-name mg-model-name-static">
              {modelId.length > 28 ? modelId.slice(0, 28) + "…" : modelId}
            </span>
            <div className="mg-cells">
              {displayHarnesses.map((harness) => {
                const run = runByCell.get(cellKey(modelId, harness));
                if (!run) {
                  return <div key={harness} className="mg-cell mg-cell-empty" />;
                }
                const runState = state[run.id] ?? mapRunStatus(run.status);
                return (
                  <div
                    key={harness}
                    className={`mg-cell mg-live-cell`}
                    onClick={() => onCellClick?.(run.id)}
                    title={`${modelId} · ${harness} · ${runState}`}
                  >
                    <LiveDot runState={runState} />
                  </div>
                );
              })}
            </div>
            <div />
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveDot({ runState }: { runState: CellRunState }) {
  const cls = `mg-live-dot mg-live-dot-${runState}`;
  const label = runState === "success" ? "✓" : runState === "error" ? "✗" : "";
  return (
    <span className={cls} aria-label={runState}>
      {label}
    </span>
  );
}
