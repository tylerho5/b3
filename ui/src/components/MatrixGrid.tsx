import "../styles/matrix-grid.css";
import type { MatrixCell } from "../launcher/resolveCells";

export type CellRunState = "pending" | "running" | "success" | "error";

interface MatrixGridProps {
  cells: MatrixCell[];
  state?: Record<string, CellRunState>;
  onRemove?: (cellId: string) => void;
  showLegend?: boolean;
}

export function MatrixGrid({
  cells,
  state,
  onRemove,
  showLegend = true,
}: MatrixGridProps) {
  if (cells.length === 0) {
    return (
      <div className="matrix-grid matrix-grid-empty">
        no cells — pick providers and models
      </div>
    );
  }

  const ccCount = cells.filter((c) => c.harness === "claude_code").length;
  const codexCount = cells.filter((c) => c.harness === "codex").length;

  return (
    <div className="matrix-grid-wrap">
      <div className="matrix-grid" role="list">
        {cells.map((cell) => (
          <CellSquare
            key={cell.id}
            cell={cell}
            runState={state?.[cell.id]}
            onRemove={onRemove}
          />
        ))}
      </div>
      {showLegend && (ccCount > 0 || codexCount > 0) && (
        <div className="matrix-grid-legend">
          {ccCount > 0 && (
            <span className="matrix-grid-legend-item">
              <span className="matrix-grid-swatch matrix-grid-swatch-cc" />
              {ccCount} cc
            </span>
          )}
          {codexCount > 0 && (
            <span className="matrix-grid-legend-item">
              <span className="matrix-grid-swatch matrix-grid-swatch-codex" />
              {codexCount} codex
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function CellSquare({
  cell,
  runState,
  onRemove,
}: {
  cell: MatrixCell;
  runState?: CellRunState;
  onRemove?: (id: string) => void;
}) {
  const className = [
    "matrix-cell",
    `matrix-cell-${cell.harness === "claude_code" ? "cc" : "codex"}`,
    runState ? `matrix-cell-${runState}` : "",
    cell.warning ? "matrix-cell-warning" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const tooltipParts = [
    cell.harness,
    cell.providerId,
    cell.modelId,
  ];
  if (cell.warning) tooltipParts.push(`⚠ ${cell.warning}`);
  if (runState) tooltipParts.push(`(${runState})`);
  const title = tooltipParts.join(" · ");

  return (
    <div className={className} role="listitem" title={title}>
      {cell.warning && (
        <span className="matrix-cell-warn-badge" aria-label="warning">
          ⚠
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          className="matrix-cell-remove"
          aria-label={`remove ${cell.modelId}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(cell.id);
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
