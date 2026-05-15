import { useState } from "react";
import { api } from "../../api/client";
import type {
  Provider,
  ProviderKind,
  ProviderModel,
  SubscriptionStatus,
} from "../../types/shared";
import { ProviderModelList } from "./ProviderModelList";
import { AddModelInline } from "./AddModelInline";

const KIND_LABEL: Record<ProviderKind, string> = {
  claude_subscription: "Claude Code",
  codex_subscription: "Codex",
  openrouter: "OpenRouter",
  anthropic_api_direct: "Anthropic API",
  openai_api_direct: "OpenAI API",
  custom_anthropic_compat: "Anthropic-compat",
  custom_openai_compat: "OpenAI-compat",
};

const HARNESS_LOGIN: Record<string, string> = {
  claude_subscription: "claude login",
  codex_subscription: "codex login",
};

function kindBorderCls(kind: ProviderKind): string {
  if (kind === "claude_subscription" || kind === "anthropic_api_direct" || kind === "custom_anthropic_compat") {
    return "cat-plugin";
  }
  if (kind === "codex_subscription" || kind === "openai_api_direct" || kind === "custom_openai_compat") {
    return "cat-user";
  }
  return "accent";
}

function isSubscriptionKind(kind: ProviderKind): boolean {
  return kind === "claude_subscription" || kind === "codex_subscription";
}

function isApiKind(kind: ProviderKind): boolean {
  return (
    kind === "anthropic_api_direct" ||
    kind === "openai_api_direct" ||
    kind === "custom_anthropic_compat" ||
    kind === "custom_openai_compat"
  );
}

function pillFor(status: SubscriptionStatus | null | undefined): {
  cls: string;
  label: string;
} {
  if (!status) return { cls: "muted", label: "checking…" };
  if (!status.installed) return { cls: "error", label: "not installed" };
  if (!status.authenticated) return { cls: "warning", label: "not signed in" };
  return { cls: "ok", label: "ready" };
}

interface Props {
  provider: Provider | null;
  kind: ProviderKind;
  models: ProviderModel[];
  subscriptionStatus?: SubscriptionStatus | null;
  onChanged: () => void;
  onEditProvider?: () => void;
}

export function ProviderRow({
  provider,
  kind,
  models,
  subscriptionStatus,
  onChanged,
  onEditProvider,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = provider?.name ?? KIND_LABEL[kind];
  const pill = isSubscriptionKind(kind) ? pillFor(subscriptionStatus) : null;

  const addToProviders = async () => {
    setAdding(true);
    setError(null);
    try {
      await api.createProvider({ name, kind });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const deleteProvider = async () => {
    if (!provider || !confirm(`Delete provider "${provider.name}"?`)) return;
    try {
      await api.deleteProvider(provider.id);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div
      className={`provider-row ${kindBorderCls(kind)}`}
      data-kind={kind}
    >
      <div className="provider-row-head">
        <div className="provider-row-head-left">
          <span className="provider-row-name">{name}</span>
          <span className="kind-badge">{KIND_LABEL[kind]}</span>
          {pill && (
            <span className={`status-pill ${pill.cls}`}>
              <span className="dot" />
              {pill.label}
            </span>
          )}
        </div>
        <div className="provider-row-head-right">
          {/* Subscription: not installed */}
          {isSubscriptionKind(kind) && subscriptionStatus && !subscriptionStatus.installed && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                void api.getSubscriptionStatus(
                  kind === "claude_subscription" ? "claude_code" : "codex",
                ).then(() => onChanged());
              }}
            >
              refresh
            </button>
          )}

          {/* Subscription: installed but not authed */}
          {isSubscriptionKind(kind) && subscriptionStatus?.installed && !subscriptionStatus.authenticated && (
            <>
              <pre className="snippet">{HARNESS_LOGIN[kind]}</pre>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  void api.getSubscriptionStatus(
                    kind === "claude_subscription" ? "claude_code" : "codex",
                  ).then(() => onChanged());
                }}
              >
                refresh
              </button>
            </>
          )}

          {/* Subscription: ready, not yet added */}
          {isSubscriptionKind(kind) && subscriptionStatus?.installed && subscriptionStatus.authenticated && !provider && (
            <button
              type="button"
              className="primary"
              onClick={() => void addToProviders()}
              disabled={adding}
            >
              {adding ? "adding…" : "+ add"}
            </button>
          )}

          {/* Subscription or OpenRouter: added */}
          {(provider && (isSubscriptionKind(kind) || kind === "openrouter")) && (
            <button
              type="button"
              className="secondary"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "collapse" : "expand"}
            </button>
          )}

          {/* OpenRouter: added */}
          {provider && kind === "openrouter" && (
            <button type="button" className="secondary">
              browse catalog
            </button>
          )}

          {/* API: edit + delete */}
          {provider && isApiKind(kind) && (
            <>
              <button
                type="button"
                className="secondary"
                onClick={onEditProvider}
              >
                edit
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => void deleteProvider()}
              >
                delete
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "collapse" : "expand"}
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="callout-error">{error}</div>}

      {expanded && (
        <div className="provider-row-body">
          <ProviderModelList
            providerId={provider?.id ?? ""}
            providerKind={kind}
            models={models}
            onChanged={onChanged}
          />
          {provider && !showAddModel && (
            <div className="provider-row-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowAddModel(true)}
              >
                + add model
              </button>
            </div>
          )}
          {provider && showAddModel && (
            <AddModelInline
              providerId={provider.id}
              providerKind={kind}
              onAdded={() => {
                setShowAddModel(false);
                onChanged();
              }}
              onCancel={() => setShowAddModel(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
