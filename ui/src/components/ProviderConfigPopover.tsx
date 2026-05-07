import { useEffect, useRef } from "react";
import type { Harness, Provider, ProviderModel } from "../types/shared";
import { routeLabel } from "../lib/routeLabel";
import "../styles/provider-config-popover.css";

interface Props {
  modelName: string;
  providers: Provider[];
  providerModels: ProviderModel[];
  pins: Record<string, Partial<Record<Harness, string>>>;
  onSelectRoute: (harness: Harness, routeId: string) => void;
  onRemoveModel: () => void;
  onClose: () => void;
}

const ALL_HARNESSES: Harness[] = ["claude_code", "codex"];

const HARNESS_LABEL: Record<Harness, string> = {
  claude_code: "claude code",
  codex: "codex",
};

const KIND_HARNESSES: Record<string, ReadonlyArray<Harness>> = {
  anthropic_api_direct: ["claude_code"],
  openai_api_direct: ["codex"],
  openrouter: ["claude_code", "codex"],
  claude_subscription: ["claude_code"],
  codex_subscription: ["codex"],
  custom_anthropic_compat: ["claude_code"],
  custom_openai_compat: ["codex"],
};

function tierLabel(kind: string): string {
  if (kind === "claude_subscription" || kind === "codex_subscription") return "subscription";
  return "per-token";
}

export function ProviderConfigPopover({
  modelName,
  providers,
  providerModels,
  pins,
  onSelectRoute,
  onRemoveModel,
  onClose,
}: Props) {
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const modelProviderIds = new Set(
    providerModels.filter((m) => m.modelId === modelName).map((m) => m.providerId),
  );

  function eligibleFor(harness: Harness): Provider[] {
    return providers
      .filter(
        (p) =>
          modelProviderIds.has(p.id) && KIND_HARNESSES[p.kind]?.includes(harness),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  const shortName = modelName.length > 28 ? modelName.slice(0, 28) + "…" : modelName;

  return (
    <div className="pcp-popover" ref={popRef} onClick={(e) => e.stopPropagation()}>
      <div className="pcp-header">{shortName}</div>

      {ALL_HARNESSES.map((harness) => {
        const options = eligibleFor(harness);
        const selectedId = pins[modelName]?.[harness] ?? null;

        return (
          <div key={harness} className="pcp-section">
            <div className="pcp-section-title">{HARNESS_LABEL[harness]}</div>
            {options.length === 0 ? (
              <div className="pcp-empty">no providers configured</div>
            ) : (
              options.map((p) => (
                <label
                  key={p.id}
                  className={`pcp-option${selectedId === p.id ? " selected" : ""}`}
                  onClick={() => onSelectRoute(harness, p.id)}
                >
                  <span className="pcp-option-bullet">
                    {selectedId === p.id ? "●" : "○"}
                  </span>
                  <span className="pcp-option-name">{routeLabel(p)}</span>
                  <span className="pcp-option-tier">{tierLabel(p.kind)}</span>
                </label>
              ))
            )}
          </div>
        );
      })}

      <div className="pcp-divider" />
      <button type="button" className="pcp-remove" onClick={onRemoveModel}>
        remove from matrix
      </button>
    </div>
  );
}
