import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Provider, ProviderModel } from "../types/shared";
import { SubscriptionTile } from "../components/providers/SubscriptionTile";
import { OpenRouterTile } from "../components/providers/OpenRouterTile";
import { ApiProviderRow } from "../components/providers/ApiProviderRow";
import { AddProviderModal } from "../components/providers/AddProviderModal";
import { JudgeTemplateEditor } from "../components/providers/JudgeTemplateEditor";
import "../styles/providers.css";

export function Providers() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);

  const refresh = async () => {
    setError(null);
    try {
      const r = await api.listProviders();
      setProviders(r.providers);
      setModels(r.models);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const modelsByProvider = useMemo(() => {
    const m = new Map<string, ProviderModel[]>();
    for (const row of models) {
      const list = m.get(row.providerId) ?? [];
      list.push(row);
      m.set(row.providerId, list);
    }
    return m;
  }, [models]);

  const claudeSub = providers.find((p) => p.kind === "claude_subscription") ?? null;
  const codexSub = providers.find((p) => p.kind === "codex_subscription") ?? null;
  const openrouter = providers.find((p) => p.kind === "openrouter") ?? null;
  const openrouterModels = openrouter
    ? modelsByProvider.get(openrouter.id) ?? []
    : [];
  const apiProviders = providers.filter(
    (p) =>
      p.kind === "anthropic_api_direct" ||
      p.kind === "openai_api_direct" ||
      p.kind === "custom_anthropic_compat" ||
      p.kind === "custom_openai_compat",
  );

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (p: Provider) => {
    setEditing(p);
    setModalOpen(true);
  };
  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };
  const onSaved = () => {
    void refresh();
  };

  return (
    <div className="providers-page-v2">
      {error && <div className="callout-error">{error}</div>}
      {loading && <div className="meta-line dim">loading…</div>}

      <section className="providers-section">
        <h2 className="providers-section-head">Subscriptions</h2>
        <div className="tile-grid">
          <SubscriptionTile
            harness="claude_code"
            existing={claudeSub}
            onChanged={onSaved}
          />
          <SubscriptionTile
            harness="codex"
            existing={codexSub}
            onChanged={onSaved}
          />
        </div>
      </section>

      <section className="providers-section">
        <h2 className="providers-section-head">OpenRouter</h2>
        <OpenRouterTile
          existing={openrouter}
          models={openrouterModels}
          onChanged={onSaved}
        />
      </section>

      <section className="providers-section">
        <div className="providers-section-bar">
          <h2 className="providers-section-head">API providers</h2>
          <span className="spacer" />
          <button type="button" className="primary" onClick={openAdd}>
            + add provider
          </button>
        </div>
        {apiProviders.length === 0 ? (
          <div className="providers-empty">
            No API providers yet. Add one above to get started.
          </div>
        ) : (
          <div className="api-list">
            {apiProviders.map((p) => (
              <ApiProviderRow
                key={p.id}
                provider={p}
                modelCount={modelsByProvider.get(p.id)?.length ?? 0}
                onEdit={() => openEdit(p)}
                onDeleted={onSaved}
              />
            ))}
          </div>
        )}
      </section>

      <section className="providers-section">
        <h2 className="providers-section-head">Judge template</h2>
        <JudgeTemplateEditor />
      </section>

      {modalOpen && (
        <AddProviderModal
          editing={editing}
          existingModels={
            editing ? modelsByProvider.get(editing.id) ?? [] : undefined
          }
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
