import "../styles/matrix-grid.css";
import "../styles/route-chip.css";
import type { Harness, Provider, ProviderModel, Run } from "../types/shared";
import type { CellState } from "../hooks/useMatrixSelection";
import { cellKey } from "../hooks/useMatrixSelection";
import { resolveRoute } from "../lib/resolveRoute";
import { routeLabel } from "../lib/routeLabel";
import { RouteChip } from "./RouteChip";
import type { RouteOption } from "./RouteChip";

export type CellRunState = "pending" | "running" | "success" | "error";

const ALL_HARNESSES: Harness[] = ["claude_code", "codex"];

const KIND_HARNESSES: Record<string, ReadonlyArray<Harness>> = {
  anthropic_api_direct: ["claude_code"],
  openai_api_direct: ["codex"],
  openrouter: ["claude_code", "codex"],
  claude_subscription: ["claude_code"],
  codex_subscription: ["codex"],
  custom_anthropic_compat: ["claude_code"],
  custom_openai_compat: ["codex"],
};

type CellAvailability = "native" | "openrouter_only" | "unsupported";

function cellAvailability(
  modelName: string,
  harness: Harness,
  providers: Provider[],
  providerModels: ProviderModel[],
): CellAvailability {
  const modelProviderIds = new Set(
    providerModels.filter((m) => m.modelId === modelName).map((m) => m.providerId),
  );
  const hasNative = providers.some(
    (p) =>
      p.kind !== "openrouter" &&
      modelProviderIds.has(p.id) &&
      KIND_HARNESSES[p.kind]?.includes(harness),
  );
  if (hasNative) return "native";
  const hasOr = providers.some(
    (p) => p.kind === "openrouter" && modelProviderIds.has(p.id),
  );
  return hasOr ? "openrouter_only" : "unsupported";
}

function routeOptionsForCell(
  modelName: string,
  harness: Harness,
  providers: Provider[],
  providerModels: ProviderModel[],
): RouteOption[] {
  const modelProviderIds = new Set(
    providerModels.filter((m) => m.modelId === modelName).map((m) => m.providerId),
  );
  return providers
    .filter(
      (p) =>
        modelProviderIds.has(p.id) && KIND_HARNESSES[p.kind]?.includes(harness),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => ({ id: p.id, label: routeLabel(p), name: p.name }));
}

// ── Configure mode ──────────────────────────────────────────

interface ConfigureProps {
  mode: "configure";
  models: string[];
  cells: Record<string, CellState>;
  providers: Provider[];
  providerModels: ProviderModel[];
  pins: Record<string, string>;
  onToggleCell: (model: string, harness: Harness) => void;
  onSwapRoute: (model: string, harness: Harness, routeId: string) => void;
  onPinRoute: (model: string, routeId: string) => void;
  onRemoveModel: (model: string) => void;
  onRemoveAll: () => void;
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
  providers,
  providerModels,
  pins,
  onToggleCell,
  onSwapRoute,
  onPinRoute,
  onRemoveModel,
  onRemoveAll,
}: Omit<ConfigureProps, "mode">) {
  const checkedCount = Object.values(cells).filter((c) => c.checked).length;

  if (models.length === 0) {
    return (
      <div className="mg-empty">
        no models — click <strong>+ add models</strong> to begin
      </div>
    );
  }

  return (
    <div className="mg-wrap">
      <table className="mg-table">
        <thead>
          <tr>
            <th className="mg-model-col">model</th>
            {ALL_HARNESSES.map((h) => (
              <th key={h} className="mg-harness-col">
                {h === "claude_code" ? "claude code" : h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((modelName) => (
            <ConfigureRow
              key={modelName}
              modelName={modelName}
              cells={cells}
              providers={providers}
              providerModels={providerModels}
              pins={pins}
              onToggleCell={onToggleCell}
              onSwapRoute={onSwapRoute}
              onPinRoute={onPinRoute}
              onRemoveModel={onRemoveModel}
            />
          ))}
        </tbody>
      </table>
      <div className="mg-footer">
        <span>{checkedCount} cell{checkedCount === 1 ? "" : "s"} ready</span>
        <button type="button" className="danger" onClick={onRemoveAll}>
          ✕ remove all
        </button>
      </div>
    </div>
  );
}

function ConfigureRow({
  modelName,
  cells,
  providers,
  providerModels,
  pins,
  onToggleCell,
  onSwapRoute,
  onPinRoute,
  onRemoveModel,
}: {
  modelName: string;
  cells: Record<string, CellState>;
  providers: Provider[];
  providerModels: ProviderModel[];
  pins: Record<string, string>;
  onToggleCell: (model: string, harness: Harness) => void;
  onSwapRoute: (model: string, harness: Harness, routeId: string) => void;
  onPinRoute: (model: string, routeId: string) => void;
  onRemoveModel: (model: string) => void;
}) {
  return (
    <tr className="mg-row">
      <td className="mg-model-cell">
        <div className="mg-model-cell-inner">
          <span title={modelName}>
            {modelName.length > 22 ? modelName.slice(0, 22) + "…" : modelName}
          </span>
          <button
            type="button"
            className="mg-row-remove"
            title={`remove ${modelName}`}
            onClick={() => onRemoveModel(modelName)}
          >
            ✕
          </button>
        </div>
      </td>
      {ALL_HARNESSES.map((harness) => {
        const avail = cellAvailability(modelName, harness, providers, providerModels);
        const key = cellKey(modelName, harness);
        const cellState = cells[key];
        const checked = cellState?.checked ?? false;

        if (avail === "unsupported") {
          return (
            <td key={harness} className="mg-cell mg-cell-na">
              n/a
            </td>
          );
        }

        if (avail === "openrouter_only" && !checked) {
          return (
            <td
              key={harness}
              className="mg-cell mg-cell-crossprotocol"
              onClick={() => onToggleCell(modelName, harness)}
              title="Available via OpenRouter cross-protocol — click to include"
            >
              <span className="mg-xp-na">n/a</span>
              <span className="mg-xp-hint">+ via openrouter</span>
            </td>
          );
        }

        // Native or opted-in cross-protocol
        const resolvedId =
          cellState?.routeOverride ??
          resolveRoute({ modelName, harness, providers, providerModels, pins });
        const resolvedProvider = providers.find((p) => p.id === resolvedId);
        const options = routeOptionsForCell(modelName, harness, providers, providerModels);

        return (
          <td
            key={harness}
            className={`mg-cell mg-cell-available${!checked ? " mg-cell-excluded" : ""}`}
          >
            <label>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggleCell(modelName, harness)}
              />
              {resolvedProvider && (
                <RouteChip
                  modelName={modelName}
                  routeId={resolvedId!}
                  routeLabel={routeLabel(resolvedProvider)}
                  pinnedRouteId={pins[modelName]}
                  options={options}
                  onSwap={(routeId) => onSwapRoute(modelName, harness, routeId)}
                  onPin={(routeId) => onPinRoute(modelName, routeId)}
                />
              )}
            </label>
          </td>
        );
      })}
    </tr>
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

function LiveGrid({
  runs,
  state,
  onCellClick,
}: Omit<LiveProps, "mode">) {
  if (runs.length === 0) {
    return <div className="mg-empty">no active runs</div>;
  }

  // Derive rows (unique models) and columns (unique harnesses) from runs
  const models = Array.from(new Set(runs.map((r) => r.modelId)));
  const harnesses = Array.from(new Set(runs.map((r) => r.harness))) as Harness[];

  // Key: modelId::harness → Run
  const runByCell = new Map<string, Run>();
  for (const r of runs) {
    runByCell.set(cellKey(r.modelId, r.harness), r);
  }

  return (
    <div className="mg-wrap">
      <table className="mg-table">
        <thead>
          <tr>
            <th className="mg-model-col">model</th>
            {harnesses.map((h) => (
              <th key={h} className="mg-harness-col">
                {h === "claude_code" ? "claude code" : h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((modelId) => (
            <tr key={modelId} className="mg-row">
              <td className="mg-model-cell">
                <span title={modelId}>
                  {modelId.length > 22 ? modelId.slice(0, 22) + "…" : modelId}
                </span>
              </td>
              {harnesses.map((harness) => {
                const run = runByCell.get(cellKey(modelId, harness));
                if (!run) {
                  return (
                    <td key={harness} className="mg-cell mg-cell-na">
                      —
                    </td>
                  );
                }
                const runState = state[run.id] ?? mapRunStatus(run.status);
                return (
                  <td
                    key={harness}
                    className="mg-live-cell"
                    onClick={() => onCellClick?.(run.id)}
                    title={`${modelId} · ${harness} · ${runState}`}
                  >
                    <LiveDot runState={runState} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
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
