import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type {
  OpenRouterModel,
  Provider,
  ProviderModelInput,
} from "../../types/shared";
import {
  DEFAULT_FILTERS,
  filterCatalog,
  sortCatalog,
  type CatalogFilterState,
  type CatalogSort,
} from "./catalogFilter";

export function OpenRouterCatalogModal({
  provider,
  existingModelIds,
  onClose,
  onSaved,
}: {
  provider: Provider;
  existingModelIds: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [catalog, setCatalog] = useState<OpenRouterModel[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<CatalogFilterState>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<CatalogSort>("name");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(existingModelIds),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await api.getOpenRouterCatalog(provider.id);
      setCatalog(r.data);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [provider.id]);

  const visible = useMemo(() => {
    if (!catalog) return [];
    return sortCatalog(filterCatalog(catalog, filters), sort);
  }, [catalog, filters, sort]);

  const additions = useMemo(
    () => [...selected].filter((id) => !existingModelIds.has(id)),
    [selected, existingModelIds],
  );
  const removals = useMemo(
    () => [...existingModelIds].filter((id) => !selected.has(id)),
    [selected, existingModelIds],
  );
  const dirty = additions.length > 0 || removals.length > 0;

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!catalog) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (additions.length > 0) {
        const byId = new Map(catalog.map((m) => [m.id, m]));
        const inputs: ProviderModelInput[] = additions.map((id) => {
          const m = byId.get(id);
          return {
            modelId: id,
            displayName: m?.name ?? id,
            contextLength: m?.context_length ?? null,
            inputCostPerMtok: perMtok(m?.pricing?.prompt),
            outputCostPerMtok: perMtok(m?.pricing?.completion),
            supportedParameters: m?.supported_parameters ?? null,
          };
        });
        await api.addProviderModels(provider.id, inputs);
      }
      for (const id of removals) {
        await api.removeProviderModel(provider.id, id);
      }
      onSaved();
      onClose();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-content modal-wide">
        <div className="modal-header">
          OpenRouter catalog
          <span className="spacer" />
          <button
            type="button"
            className="secondary"
            onClick={() => void load()}
            disabled={loading}
          >
            refresh
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            close
          </button>
        </div>

        <div className="catalog-toolbar">
          <input
            type="text"
            placeholder="search…"
            value={filters.search}
            onChange={(e) =>
              setFilters({ ...filters, search: e.target.value })
            }
            className="catalog-search"
          />
          <FilterChip
            label="tools"
            on={filters.tools}
            onClick={() => setFilters({ ...filters, tools: !filters.tools })}
          />
          <FilterChip
            label="vision"
            on={filters.vision}
            onClick={() =>
              setFilters({ ...filters, vision: !filters.vision })
            }
          />
          <FilterChip
            label="free"
            on={filters.free}
            onClick={() => setFilters({ ...filters, free: !filters.free })}
          />
          <FilterChip
            label="Anthropic-only"
            on={filters.anthropicOnly}
            onClick={() =>
              setFilters({
                ...filters,
                anthropicOnly: !filters.anthropicOnly,
              })
            }
          />
          <span className="spacer" />
          <label className="catalog-sort">
            sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as CatalogSort)}
            >
              <option value="name">name</option>
              <option value="price">price</option>
              <option value="context">context length</option>
            </select>
          </label>
        </div>

        <div className="catalog-list">
          {loading && <div className="catalog-empty">loading catalog…</div>}
          {loadError && (
            <div className="callout-error">{loadError}</div>
          )}
          {!loading && !loadError && visible.length === 0 && (
            <div className="catalog-empty">no models match</div>
          )}
          {visible.map((m) => (
            <CatalogRow
              key={m.id}
              model={m}
              selected={selected.has(m.id)}
              onToggle={() => toggle(m.id)}
            />
          ))}
        </div>

        <div className="modal-footer catalog-footer">
          <span className="modal-status">
            {dirty
              ? `${additions.length} added · ${removals.length} removed`
              : "no changes"}
          </span>
          {saveError && <span className="catalog-error">{saveError}</span>}
          <button type="button" className="secondary" onClick={onClose}>
            discard
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void save()}
            disabled={!dirty || saving}
          >
            {saving ? "saving…" : "save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CatalogRow({
  model,
  selected,
  onToggle,
}: {
  model: OpenRouterModel;
  selected: boolean;
  onToggle: () => void;
}) {
  const ctx = model.context_length
    ? `${Math.round(model.context_length / 1000)}k ctx`
    : null;
  const price = formatPrice(model);
  const params = model.supported_parameters?.join(", ") ?? "";
  const isAnthropic = model.id.startsWith("anthropic/");

  return (
    <div className={`catalog-row ${selected ? "selected" : ""}`}>
      <div className="catalog-row-main">
        <div className="catalog-row-id">
          {model.id}
          {!isAnthropic && (
            <span
              className="catalog-warn"
              title="Non-Anthropic models may have feature gaps under Claude Code"
            >
              ⚠
            </span>
          )}
        </div>
        <div className="catalog-row-meta">
          <span className="catalog-row-name">{model.name}</span>
          {ctx && <span className="catalog-row-stat">{ctx}</span>}
          {price && <span className="catalog-row-stat">{price}</span>}
        </div>
        {params && <div className="catalog-row-params">{params}</div>}
      </div>
      <button
        type="button"
        className={selected ? "primary" : "secondary"}
        onClick={onToggle}
      >
        {selected ? "✓ added" : "+ add"}
      </button>
    </div>
  );
}

function FilterChip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`catalog-chip ${on ? "on" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function formatPrice(m: OpenRouterModel): string | null {
  const p = m.pricing;
  if (!p?.prompt && !p?.completion) return null;
  const inP = perMtok(p.prompt);
  const outP = perMtok(p.completion);
  if (inP == null && outP == null) return null;
  if (inP === 0 && outP === 0) return "free";
  return `$${fmt(inP)} / $${fmt(outP)} per Mtok`;
}

function perMtok(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n * 1_000_000;
}

function fmt(n: number | null): string {
  if (n == null) return "—";
  if (n === 0) return "0";
  if (n < 0.01) return n.toFixed(4);
  return n.toFixed(2);
}
