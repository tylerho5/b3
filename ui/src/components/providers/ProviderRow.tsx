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
import { SubscriptionModelChecklist } from "./SubscriptionModelChecklist";
import { OpenRouterCatalogModal } from "./OpenRouterCatalogModal";

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
  const [showCatalog, setShowCatalog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = provider?.name ?? KIND_LABEL[kind];
  const pill = isSubscriptionKind(kind) ? pillFor(subscriptionStatus) : null;

  const canExpand = !!provider;
  const toggle = () => {
    if (canExpand) setExpanded((v) => !v);
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();

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

  const refreshSubscription = () => {
    void api
      .getSubscriptionStatus(kind === "claude_subscription" ? "claude_code" : "codex")
      .then(() => onChanged());
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

  const subNotInstalled =
    isSubscriptionKind(kind) && subscriptionStatus && !subscriptionStatus.installed;
  const subNotAuthed =
    isSubscriptionKind(kind) &&
    subscriptionStatus?.installed &&
    !subscriptionStatus.authenticated;
  const subReadyNotAdded =
    isSubscriptionKind(kind) &&
    subscriptionStatus?.installed &&
    subscriptionStatus.authenticated &&
    !provider;

  return (
    <div
      className={`provider-row ${kindBorderCls(kind)}`}
      data-kind={kind}
    >
      <div
        className={`provider-row-head${canExpand ? " is-toggle" : ""}`}
        onClick={canExpand ? toggle : undefined}
        role={canExpand ? "button" : undefined}
        aria-expanded={canExpand ? expanded : undefined}
        tabIndex={canExpand ? 0 : undefined}
        onKeyDown={
          canExpand
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle();
                }
              }
            : undefined
        }
      >
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
        <div className="provider-row-head-right" onClick={stop}>
          {subNotInstalled && (
            <button type="button" className="secondary" onClick={refreshSubscription}>
              refresh
            </button>
          )}

          {subNotAuthed && (
            <>
              <pre className="snippet">{HARNESS_LOGIN[kind]}</pre>
              <button type="button" className="secondary" onClick={refreshSubscription}>
                refresh
              </button>
            </>
          )}

          {subReadyNotAdded && (
            <button
              type="button"
              className="primary"
              onClick={() => void addToProviders()}
              disabled={adding}
            >
              {adding ? "adding…" : "+ add"}
            </button>
          )}

          {provider && kind === "openrouter" && (
            <button type="button" className="secondary" onClick={() => setShowCatalog(true)}>
              browse catalog
            </button>
          )}

          {provider && isApiKind(kind) && (
            <button type="button" className="secondary" onClick={onEditProvider}>
              edit
            </button>
          )}

          {canExpand && (
            <button
              type="button"
              className="row-chevron"
              aria-label={expanded ? "collapse" : "expand"}
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: expanded ? "rotate(180deg)" : "none",
                  transition: "transform 120ms ease",
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {error && <div className="callout-error">{error}</div>}

      {expanded && (
        <div className="provider-row-body">
          {provider && isSubscriptionKind(kind) ? (
            <SubscriptionModelChecklist
              providerId={provider.id}
              providerKind={kind as "claude_subscription" | "codex_subscription"}
              models={models}
              onChanged={onChanged}
            />
          ) : (
            <ProviderModelList
              providerId={provider?.id ?? ""}
              providerKind={kind}
              models={models}
              onChanged={onChanged}
            />
          )}
          {provider && !isSubscriptionKind(kind) && !showAddModel && (
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
          {provider && !isSubscriptionKind(kind) && showAddModel && (
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
          {provider && isApiKind(kind) && (
            <div className="provider-row-danger">
              <button
                type="button"
                className="danger"
                onClick={() => void deleteProvider()}
              >
                delete provider
              </button>
            </div>
          )}
        </div>
      )}
      {showCatalog && provider && (
        <OpenRouterCatalogModal
          provider={provider}
          existingModelIds={new Set(models.map((m) => m.modelId))}
          onClose={() => setShowCatalog(false)}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}
