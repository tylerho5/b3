import { useState } from "react";
import { api } from "../../api/client";
import type { Provider, ProviderModel } from "../../types/shared";
import { OpenRouterCatalogModal } from "./OpenRouterCatalogModal";

export function OpenRouterTile({
  existing,
  models,
  onChanged,
}: {
  existing: Provider | null;
  models: ProviderModel[];
  onChanged: () => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [addPending, setAddPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyMode, setKeyMode] = useState<"paste" | "env">("paste");
  const [apiKey, setApiKey] = useState("");
  const [envRef, setEnvRef] = useState("");
  const [removing, setRemoving] = useState(false);

  const existingModelIds = new Set(models.map((m) => m.modelId));

  const create = async () => {
    setAddPending(true);
    setError(null);
    try {
      const provider = await api.createProvider({
        name: "OpenRouter",
        kind: "openrouter",
        apiKey: keyMode === "paste" ? apiKey : null,
        apiKeyEnvRef: keyMode === "env" ? envRef : null,
      });
      const probe = await api.probeProvider(provider.id);
      if (!probe.ok) {
        setError(`probe failed: ${probe.message}`);
      }
      setShowAddForm(false);
      setApiKey("");
      setEnvRef("");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAddPending(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    if (!confirm(`Remove ${existing.name} and all its models?`)) return;
    setRemoving(true);
    setError(null);
    try {
      await api.deleteProvider(existing.id);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRemoving(false);
    }
  };

  if (!existing) {
    return (
      <div className="provider-tile or-tile" data-empty="true">
        <div className="provider-tile-head">
          <h3>OpenRouter</h3>
          <span className="status-pill muted">
            <span className="dot" />
            not configured
          </span>
        </div>
        <div className="provider-tile-body">
          <p className="meta-line dim">
            Single API key, dual-harness. Browse and pick from OpenRouter's
            full model catalog.
          </p>
          {showAddForm ? (
            <div className="or-add-form">
              <div className="or-add-toggle">
                <label>
                  <input
                    type="radio"
                    name="key-mode"
                    checked={keyMode === "paste"}
                    onChange={() => setKeyMode("paste")}
                  />
                  paste key
                </label>
                <label>
                  <input
                    type="radio"
                    name="key-mode"
                    checked={keyMode === "env"}
                    onChange={() => setKeyMode("env")}
                  />
                  env var
                </label>
              </div>
              {keyMode === "paste" ? (
                <input
                  type="password"
                  placeholder="sk-or-v1-…"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="or-add-input"
                />
              ) : (
                <input
                  type="text"
                  placeholder="OPENROUTER_API_KEY"
                  value={envRef}
                  onChange={(e) => setEnvRef(e.target.value)}
                  className="or-add-input"
                />
              )}
              {error && <div className="callout-error">{error}</div>}
              <div className="or-add-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setShowAddForm(false);
                    setError(null);
                  }}
                >
                  cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void create()}
                  disabled={
                    addPending ||
                    (keyMode === "paste" ? !apiKey : !envRef)
                  }
                >
                  {addPending ? "saving…" : "save"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={() => setShowAddForm(true)}
            >
              add OpenRouter
            </button>
          )}
        </div>
      </div>
    );
  }

  const credLabel = existing.apiKey
    ? "key stored"
    : existing.apiKeyEnvRef
      ? `env: ${existing.apiKeyEnvRef}`
      : "no credentials";

  return (
    <>
      <div className="provider-tile or-tile">
        <div className="provider-tile-head">
          <h3>OpenRouter</h3>
          <span className="status-pill ok">
            <span className="dot" />
            connected
          </span>
        </div>
        <div className="provider-tile-body">
          <div className="meta-line">
            <span className="meta-label">credentials</span>
            <code>{credLabel}</code>
          </div>
          <div className="meta-line">
            <span className="meta-label">models added</span>
            <code>{models.length}</code>
          </div>
          {error && <div className="callout-error">{error}</div>}
        </div>
        <div className="provider-tile-actions">
          <button
            type="button"
            className="primary"
            onClick={() => setShowCatalog(true)}
          >
            browse catalog
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="danger"
            onClick={() => void remove()}
            disabled={removing}
          >
            {removing ? "removing…" : "remove"}
          </button>
        </div>
      </div>
      {showCatalog && (
        <OpenRouterCatalogModal
          provider={existing}
          existingModelIds={existingModelIds}
          onClose={() => setShowCatalog(false)}
          onSaved={onChanged}
        />
      )}
    </>
  );
}
