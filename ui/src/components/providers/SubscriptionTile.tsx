import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type {
  Harness,
  Provider,
  ProviderKind,
  SubscriptionStatus,
} from "../../types/shared";

const HARNESS_LABEL: Record<Harness, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
};

const HARNESS_LOGIN: Record<Harness, string> = {
  claude_code: "claude login",
  codex: "codex login",
};

const HARNESS_KIND: Record<Harness, ProviderKind> = {
  claude_code: "claude_subscription",
  codex: "codex_subscription",
};

export function SubscriptionTile({
  harness,
  existing,
  onChanged,
}: {
  harness: Harness;
  existing: Provider | null;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await api.getSubscriptionStatus(harness);
      setStatus(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [harness]);

  const addToProviders = async () => {
    setAdding(true);
    setError(null);
    try {
      await api.createProvider({
        name: HARNESS_LABEL[harness],
        kind: HARNESS_KIND[harness],
      });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const pill = pillFor(status);

  return (
    <div className="provider-tile" data-harness={harness}>
      <div className="provider-tile-head">
        <h3>{HARNESS_LABEL[harness]}</h3>
        <span className={`status-pill ${pill.cls}`}>
          <span className="dot" />
          {pill.label}
        </span>
      </div>

      <div className="provider-tile-body">
        {status?.version && (
          <div className="meta-line">
            <span className="meta-label">version</span>
            <code>{status.version}</code>
          </div>
        )}

        {status && !status.installed && (
          <div className="callout-error">
            CLI binary not found on PATH. Install it, then refresh.
          </div>
        )}

        {status?.installed && !status.authenticated && (
          <>
            <div className="meta-line dim">
              Not authenticated. Sign in with the CLI:
            </div>
            <pre className="snippet">{HARNESS_LOGIN[harness]}</pre>
          </>
        )}

        {error && <div className="callout-error">{error}</div>}
      </div>

      <div className="provider-tile-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? "checking…" : "refresh"}
        </button>
        {existing ? (
          <span className="meta-label">added as provider</span>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={() => void addToProviders()}
            disabled={
              adding || !status?.installed || !status?.authenticated
            }
            title={
              !status?.installed
                ? "CLI not installed"
                : !status?.authenticated
                  ? `run \`${HARNESS_LOGIN[harness]}\` first`
                  : ""
            }
          >
            {adding ? "adding…" : "add to providers"}
          </button>
        )}
      </div>
    </div>
  );
}

function pillFor(status: SubscriptionStatus | null): {
  cls: string;
  label: string;
} {
  if (!status) return { cls: "muted", label: "checking…" };
  if (!status.installed) return { cls: "error", label: "not installed" };
  if (!status.authenticated)
    return { cls: "warning", label: "not signed in" };
  return { cls: "ok", label: "ready" };
}
