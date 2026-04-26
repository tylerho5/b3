import { useEffect, useRef, useState } from "react";
import "../styles/route-chip.css";
import { RoutePopover } from "./RoutePopover";

export interface RouteOption {
  id: string;
  label: string;
  name: string;
}

interface RouteChipProps {
  modelName: string;
  routeId: string;
  routeLabel: string;
  pinnedRouteId?: string;
  options: RouteOption[];
  onSwap: (routeId: string) => void;
  onPin: (routeId: string) => void;
}

export function RouteChip({
  modelName,
  routeId,
  routeLabel,
  pinnedRouteId,
  options,
  onSwap,
  onPin,
}: RouteChipProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isPinned = routeId === pinnedRouteId;

  return (
    <div className="route-chip-wrap" ref={wrapRef}>
      <button
        type="button"
        className="route-chip"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={`Route: ${routeLabel}${isPinned ? " (pinned)" : ""}`}
      >
        {routeLabel}
        {isPinned && <span className="route-chip-pin">•</span>}
      </button>
      {open && (
        <RoutePopover
          modelName={modelName}
          currentRouteId={routeId}
          pinnedRouteId={pinnedRouteId}
          options={options}
          onSave={(newRouteId, pin) => {
            onSwap(newRouteId);
            if (pin) onPin(newRouteId);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
