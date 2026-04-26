import { useState } from "react";
import type { RouteOption } from "./RouteChip";
import "../styles/route-chip.css";

interface RoutePopoverProps {
  modelName: string;
  currentRouteId: string;
  pinnedRouteId?: string;
  options: RouteOption[];
  onSave: (routeId: string, pin: boolean) => void;
  onClose: () => void;
}

export function RoutePopover({
  modelName,
  currentRouteId,
  pinnedRouteId,
  options,
  onSave,
  onClose,
}: RoutePopoverProps) {
  const [selected, setSelected] = useState(currentRouteId);
  const [pin, setPin] = useState(false);

  const shortName = modelName.length > 20 ? modelName.slice(0, 20) + "…" : modelName;

  return (
    <div className="route-popover" onClick={(e) => e.stopPropagation()}>
      <div className="route-popover-title">Route for {shortName}</div>
      {options.map((opt) => (
        <label key={opt.id} className="route-popover-option">
          <input
            type="radio"
            name="route"
            value={opt.id}
            checked={selected === opt.id}
            onChange={() => setSelected(opt.id)}
          />
          <span className="route-popover-option-label">{opt.label}</span>
          <span className="route-popover-option-name">{opt.name}</span>
          {opt.id === pinnedRouteId && (
            <span style={{ marginLeft: "auto", color: "var(--accent)", fontSize: 10 }}>
              •
            </span>
          )}
        </label>
      ))}
      <div className="route-popover-divider" />
      <label className="route-popover-pin-row">
        <input
          type="checkbox"
          checked={pin}
          onChange={(e) => setPin(e.target.checked)}
        />
        pin as default for {shortName}
      </label>
      <div className="route-popover-footer">
        <button
          type="button"
          className="secondary"
          style={{ fontSize: 11, padding: "3px 10px" }}
          onClick={onClose}
        >
          cancel
        </button>
        <button
          type="button"
          className="primary"
          style={{ fontSize: 11, padding: "3px 10px", marginLeft: 6 }}
          onClick={() => onSave(selected, pin)}
        >
          apply
        </button>
      </div>
    </div>
  );
}
