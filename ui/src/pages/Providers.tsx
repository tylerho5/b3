import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type {
  Provider,
  ProviderKind,
  ProviderModel,
  SubscriptionStatus,
} from "../types/shared";
import { ProviderRow } from "../components/providers/ProviderRow";
import { AddProviderModal } from "../components/providers/AddProviderModal";
import "../styles/providers.css";

export function Providers() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [claudeStatus, setClaudeStatus] = useState<SubscriptionStatus | null>(null);
  const [codexStatus, setCodexStatus] = useState<SubscriptionStatus | null>(null);

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
    void api.getSubscriptionStatus("claude_code").then(setClaudeStatus);
    void api.getSubscriptionStatus("codex").then(setCodexStatus);
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

  const byKind = useMemo(() => {
    const m = new Map<ProviderKind, Provider>();
    for (const p of providers) m.set(p.kind, p);
    return m;
  }, [providers]);

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
  const onChanged = () => {
    void refresh();
  };

  const claudeSub = byKind.get("claude_subscription");
  const codexSub = byKind.get("codex_subscription");
  const openrouter = byKind.get("openrouter");

  return (
    <div className="providers-page-v2">
      {error && <div className="callout-error">{error}</div>}
      {loading && <div className="meta-line dim">loading…</div>}

      <div className="providers-section-bar">
        <h2 className="providers-section-head">Providers</h2>
        <span className="spacer" />
        <button type="button" className="primary" onClick={openAdd}>
          + add provider
        </button>
      </div>

      <div className="provider-list">
        {/* Claude Code subscription (ghost row if not added) */}
        {(!byKind.has("claude_subscription") || claudeSub) && (
          <ProviderRow
            provider={claudeSub ?? null}
            kind="claude_subscription"
            models={claudeSub ? modelsByProvider.get(claudeSub.id) ?? [] : []}
            subscriptionStatus={claudeStatus}
            onChanged={onChanged}
          />
        )}

        {/* Codex subscription (ghost row if not added) */}
        {(!byKind.has("codex_subscription") || codexSub) && (
          <ProviderRow
            provider={codexSub ?? null}
            kind="codex_subscription"
            models={codexSub ? modelsByProvider.get(codexSub.id) ?? [] : []}
            subscriptionStatus={codexStatus}
            onChanged={onChanged}
          />
        )}

        {/* OpenRouter */}
        {(!byKind.has("openrouter") || openrouter) && (
          <ProviderRow
            provider={openrouter ?? null}
            kind="openrouter"
            models={openrouter ? modelsByProvider.get(openrouter.id) ?? [] : []}
            onChanged={onChanged}
          />
        )}

        {/* API providers */}
        {providers
          .filter(
            (p) =>
              p.kind === "anthropic_api_direct" ||
              p.kind === "openai_api_direct" ||
              p.kind === "custom_anthropic_compat" ||
              p.kind === "custom_openai_compat",
          )
          .map((p) => (
            <ProviderRow
              key={p.id}
              provider={p}
              kind={p.kind}
              models={modelsByProvider.get(p.id) ?? []}
              onChanged={onChanged}
              onEditProvider={() => openEdit(p)}
            />
          ))}
      </div>

      {modalOpen && (
        <AddProviderModal
          editing={editing}
          existingModels={
            editing ? modelsByProvider.get(editing.id) ?? [] : undefined
          }
          onClose={closeModal}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}
