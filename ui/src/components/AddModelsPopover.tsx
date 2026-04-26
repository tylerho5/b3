import { useEffect, useMemo, useRef, useState } from "react";
import type { Harness, Provider, ProviderModel } from "../types/shared";
import { inferFamily } from "../lib/inferFamily";
import { resolveRoute, nativeHarnessesForModel } from "../lib/resolveRoute";
import { routeLabel } from "../lib/routeLabel";
import "../styles/add-models-popover.css";

type Tab = "recent" | "browse";

interface AddModelsPopoverProps {
  providers: Provider[];
  providerModels: ProviderModel[];
  pins: Record<string, string>;
  recents: string[];
  selectedModels: Set<string>;
  onAdd: (modelName: string, autoCheckHarnesses: Harness[]) => void;
  onRemove: (modelName: string) => void;
  onClose: () => void;
}

export function AddModelsPopover({
  providers,
  providerModels,
  pins,
  recents,
  selectedModels,
  onAdd,
  onRemove,
  onClose,
}: AddModelsPopoverProps) {
  const [tab, setTab] = useState<Tab>("recent");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        onClose();
      }
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

  // All unique model names across all providers
  const allModels = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of providerModels) {
      if (!seen.has(m.modelId)) {
        seen.add(m.modelId);
        out.push(m.modelId);
      }
    }
    return out;
  }, [providerModels]);

  const providerById = useMemo(
    () => new Map(providers.map((p) => [p.id, p])),
    [providers],
  );

  function routeCountForModel(modelName: string): number {
    const providerIds = new Set(
      providerModels.filter((m) => m.modelId === modelName).map((m) => m.providerId),
    );
    return providerIds.size;
  }

  function defaultRouteLabel(modelName: string): string {
    // Try claude_code harness first, then codex
    for (const harness of ["claude_code", "codex"] as Harness[]) {
      const id = resolveRoute({ modelName, harness, providers, providerModels, pins });
      if (id) {
        const p = providerById.get(id);
        return p ? routeLabel(p) : id;
      }
    }
    return "—";
  }

  function toggleModel(modelName: string) {
    if (selectedModels.has(modelName)) {
      onRemove(modelName);
    } else {
      const harnesses = nativeHarnessesForModel(modelName, providers, providerModels);
      onAdd(modelName, harnesses);
    }
  }

  // Browse: group by family, filter by search
  const browseGroups = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = allModels.filter((m) => !q || m.toLowerCase().includes(q));
    const groups = new Map<string, string[]>();
    for (const m of filtered) {
      const fam = inferFamily(m);
      if (!groups.has(fam)) groups.set(fam, []);
      groups.get(fam)!.push(m);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [allModels, search]);

  const recentFiltered = useMemo(() => {
    const q = search.toLowerCase();
    return recents.filter((m) => !q || m.toLowerCase().includes(q));
  }, [recents, search]);

  function ModelRow({ modelName }: { modelName: string }) {
    const checked = selectedModels.has(modelName);
    const label = defaultRouteLabel(modelName);
    const count = routeCountForModel(modelName);
    return (
      <label className="add-models-model-row" onClick={() => toggleModel(modelName)}>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => {}}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="add-models-model-name" title={modelName}>
          {modelName}
        </span>
        <span className="add-models-route-info">
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--text-secondary)",
            }}
          >
            {label}
          </span>
          {count > 1 && (
            <span className="add-models-route-count">({count} routes)</span>
          )}
        </span>
      </label>
    );
  }

  return (
    <div className="add-models-popover" ref={popRef}>
      <div className="add-models-tabs">
        {(["recent", "browse"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`add-models-tab${tab === t ? " active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "browse" && (
        <div className="add-models-search">
          <input
            type="text"
            placeholder="search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
      )}

      <div className="add-models-body">
        {tab === "recent" && (
          <>
            {recentFiltered.length === 0 ? (
              <div className="add-models-empty">no recent models</div>
            ) : (
              recentFiltered.map((m) => <ModelRow key={m} modelName={m} />)
            )}
          </>
        )}

        {tab === "browse" && (
          <>
            {browseGroups.length === 0 ? (
              <div className="add-models-empty">no models found</div>
            ) : (
              browseGroups.map(([family, models]) => {
                const isCollapsed = collapsed.has(family);
                return (
                  <div key={family}>
                    <div
                      className="add-models-group-header"
                      onClick={() =>
                        setCollapsed((prev) => {
                          const next = new Set(prev);
                          if (next.has(family)) next.delete(family);
                          else next.add(family);
                          return next;
                        })
                      }
                    >
                      <span>{isCollapsed ? "▶" : "▾"}</span>
                      <span>{family}</span>
                    </div>
                    {!isCollapsed &&
                      models.map((m) => <ModelRow key={m} modelName={m} />)}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      <div className="add-models-footer">
        <button type="button" className="secondary" onClick={onClose}>
          done
        </button>
      </div>
    </div>
  );
}
