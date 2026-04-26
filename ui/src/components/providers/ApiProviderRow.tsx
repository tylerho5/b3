import { useState } from "react";
import { api } from "../../api/client";
import type { Provider, ProviderKind } from "../../types/shared";

const KIND_BADGE: Partial<Record<ProviderKind, string>> = {
  anthropic_api_direct: "Anthropic",
  openai_api_direct: "OpenAI",
  custom_anthropic_compat: "Custom (Anthropic)",
  custom_openai_compat: "Custom (OpenAI)",
};

export function ApiProviderRow({
  provider,
  modelCount,
  onEdit,
  onDeleted,
}: {
  provider: Provider;
  modelCount: number;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteProvider(provider.id);
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="api-row">
      <div className="api-row-main">
        <div className="api-row-head">
          <strong>{provider.name}</strong>
          <span className="kind-badge">{KIND_BADGE[provider.kind] ?? provider.kind}</span>
        </div>
        <div className="api-row-meta">
          <span>{modelCount} model{modelCount === 1 ? "" : "s"}</span>
          {provider.baseUrl && (
            <code className="api-row-url">{provider.baseUrl}</code>
          )}
        </div>
        {error && <div className="callout-error">{error}</div>}
      </div>
      <div className="api-row-actions">
        {confirming ? (
          <>
            <span className="meta-label">delete?</span>
            <button
              type="button"
              className="secondary"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              no
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => void remove()}
              disabled={busy}
            >
              {busy ? "…" : "yes"}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="secondary" onClick={onEdit}>
              edit
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => setConfirming(true)}
            >
              delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
