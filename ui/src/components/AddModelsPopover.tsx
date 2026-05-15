import { useEffect, useMemo, useRef, useState } from "react";
import type { Harness, Provider, ProviderModel } from "../types/shared";
import { inferFamily } from "../lib/inferFamily";
import { resolveRoute, nativeHarnessesForModel } from "../lib/resolveRoute";
import { routeLabel } from "../lib/routeLabel";
import { encodeModelKey, parseModelKey } from "../lib/modelKey";
import "../styles/add-models-popover.css";

type Tab = "recent" | "browse";

interface ModelGroup {
  modelId: string;
  efforts: string[]; // empty = no effort variants (API model)
}

interface AddModelsPopoverProps {
  providers: Provider[];
  providerModels: ProviderModel[];
  pins: Record<string, Partial<Record<Harness, string>>>;
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
  const [collapsedModels, setCollapsedModels] = useState<Set<string>>(new Set());
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

  const providerById = useMemo(
    () => new Map(providers.map((p) => [p.id, p])),
    [providers],
  );

  // One entry per modelId, with list of effort variants (empty for API models)
  const allModelGroups = useMemo(() => {
    const effortsByModel = new Map<string, Set<string>>();
    const modelOrder: string[] = [];
    for (const m of providerModels) {
      if (!effortsByModel.has(m.modelId)) {
        effortsByModel.set(m.modelId, new Set());
        modelOrder.push(m.modelId);
      }
      if (m.effort !== "") effortsByModel.get(m.modelId)!.add(m.effort);
    }
    return modelOrder.map((modelId) => ({
      modelId,
      efforts: Array.from(effortsByModel.get(modelId)!),
    }));
  }, [providerModels]);

  function defaultRouteLabel(modelId: string): string {
    for (const harness of ["claude_code", "codex"] as Harness[]) {
      const id = resolveRoute({ modelName: modelId, harness, providers, providerModels, pins });
      if (id) {
        const p = providerById.get(id);
        return p ? routeLabel(p) : id;
      }
    }
    return "—";
  }

  function toggleModel(modelKey: string) {
    if (selectedModels.has(modelKey)) {
      onRemove(modelKey);
    } else {
      const harnesses = nativeHarnessesForModel(modelKey, providers, providerModels);
      onAdd(modelKey, harnesses);
    }
  }

  function toggleGroup(group: ModelGroup) {
    const keys = group.efforts.map((e) => encodeModelKey(group.modelId, e));
    const allSelected = keys.every((k) => selectedModels.has(k));
    if (allSelected) {
      keys.forEach((k) => onRemove(k));
    } else {
      keys.filter((k) => !selectedModels.has(k)).forEach((k) => {
        const harnesses = nativeHarnessesForModel(k, providers, providerModels);
        onAdd(k, harnesses);
      });
    }
  }

  function toggleExpanded(modelId: string) {
    setCollapsedModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  }

  // Browse: group ModelGroups by family, filter by search
  const browseGroups = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = allModelGroups.filter((g) => !q || g.modelId.toLowerCase().includes(q));
    const groups = new Map<string, ModelGroup[]>();
    for (const g of filtered) {
      const fam = inferFamily(g.modelId);
      if (!groups.has(fam)) groups.set(fam, []);
      groups.get(fam)!.push(g);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [allModelGroups, search]);

  // Recent: group by modelId (recents are stored as model keys like "claude-opus-4-7::high")
  const recentGroups = useMemo(() => {
    const q = search.toLowerCase();
    const effortsByModel = new Map<string, string[]>();
    const modelOrder: string[] = [];
    for (const key of recents) {
      const { modelId, effort } = parseModelKey(key);
      if (q && !modelId.toLowerCase().includes(q)) continue;
      if (!effortsByModel.has(modelId)) {
        effortsByModel.set(modelId, []);
        modelOrder.push(modelId);
      }
      if (effort) effortsByModel.get(modelId)!.push(effort);
    }
    return modelOrder
      .map((modelId) => ({ modelId, efforts: effortsByModel.get(modelId)! }))
      .sort((a, b) => a.modelId.localeCompare(b.modelId));
  }, [recents, search]);

  function GroupRow({ group }: { group: ModelGroup }) {
    const label = defaultRouteLabel(group.modelId);

    if (group.efforts.length === 0) {
      const checked = selectedModels.has(group.modelId);
      return (
        <label className="add-models-model-row" onClick={() => toggleModel(group.modelId)}>
          <input
            type="checkbox"
            checked={checked}
            onChange={() => toggleModel(group.modelId)}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="add-models-model-name" title={group.modelId}>
            {group.modelId}
          </span>
          <span className="add-models-route-label">{label}</span>
        </label>
      );
    }

    // Single effort — show inline as "modelId · effort", no expand needed
    if (group.efforts.length === 1) {
      const key = encodeModelKey(group.modelId, group.efforts[0]);
      const checked = selectedModels.has(key);
      return (
        <label className="add-models-model-row" onClick={() => toggleModel(key)}>
          <input
            type="checkbox"
            checked={checked}
            onChange={() => toggleModel(key)}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="add-models-model-name" title={key}>
            {group.modelId} · {group.efforts[0]}
          </span>
          <span className="add-models-route-label">{label}</span>
        </label>
      );
    }

    const keys = group.efforts.map((e) => encodeModelKey(group.modelId, e));
    const selectedCount = keys.filter((k) => selectedModels.has(k)).length;
    const allSelected = selectedCount === keys.length;
    const someSelected = selectedCount > 0 && !allSelected;
    const isExpanded = !collapsedModels.has(group.modelId);

    return (
      <div>
        <div className="add-models-model-row">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = someSelected; }}
            onChange={() => toggleGroup(group)}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="add-models-expand-btn"
            onClick={() => toggleExpanded(group.modelId)}
            aria-label={isExpanded ? "collapse" : "expand"}
          >
            {isExpanded ? "▼" : "▶"}
          </button>
          <span className="add-models-model-name" title={group.modelId}>
            {group.modelId}
          </span>
          <span className="add-models-route-label">{label}</span>
        </div>
        {isExpanded &&
          group.efforts.map((effort) => {
            const key = encodeModelKey(group.modelId, effort);
            const checked = selectedModels.has(key);
            return (
              <label
                key={effort}
                className="add-models-model-row add-models-effort-row"
                onClick={() => toggleModel(key)}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleModel(key)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="add-models-effort-label">{effort}</span>
              </label>
            );
          })}
      </div>
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
            {recentGroups.length === 0 ? (
              <div className="add-models-empty">no recent models</div>
            ) : (
              recentGroups.map((g) => <GroupRow key={g.modelId} group={g} />)
            )}
          </>
        )}

        {tab === "browse" && (
          <>
            {browseGroups.length === 0 ? (
              <div className="add-models-empty">no models found</div>
            ) : (
              browseGroups.map(([family, groups]) => {
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
                    {!isCollapsed && groups.map((g) => <GroupRow key={g.modelId} group={g} />)}
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
