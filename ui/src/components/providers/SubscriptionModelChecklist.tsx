import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { ProviderModel } from "../../types/shared";
import {
  EFFORTS,
  SUBSCRIPTION_MODELS,
  type Effort,
} from "./defaultModels";

interface Props {
  providerId: string;
  providerKind: "claude_subscription" | "codex_subscription";
  models: ProviderModel[];
  onChanged: () => void;
}

const RECOMMENDED_EFFORT: Effort = "high";

const cellKey = (modelId: string, effort: string) => `${modelId}::${effort}`;

export function SubscriptionModelChecklist({
  providerId,
  providerKind,
  models,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (statusTimer.current !== null) clearTimeout(statusTimer.current);
      if (busyTimer.current !== null) clearTimeout(busyTimer.current);
    };
  }, []);

  const curated = SUBSCRIPTION_MODELS[providerKind];
  const curatedIds = new Set(curated.map((m) => m.modelId));
  const enabled = new Set(models.map((m) => cellKey(m.modelId, m.effort)));
  const customModels = models.filter((m) => !curatedIds.has(m.modelId));

  const toggle = async (modelId: string, effort: Effort, enable: boolean) => {
    const key = cellKey(modelId, effort);
    setBusy(key);
    setError(null);
    try {
      if (enable) {
        await api.addProviderModels(providerId, [
          { modelId, displayName: modelId, effort },
        ]);
      } else {
        await api.removeProviderModel(providerId, modelId, effort);
      }
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const removeCustom = async (modelId: string, effort: string) => {
    const key = cellKey(modelId, effort);
    setBusy(key);
    setError(null);
    try {
      await api.removeProviderModel(providerId, modelId, effort);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const showStatus = (msg: string) => {
    setStatus(msg);
    if (statusTimer.current !== null) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => {
      setStatus((cur) => (cur === msg ? null : cur));
      statusTimer.current = null;
    }, 4000);
  };

  const applyDefaults = async () => {
    // Remove all existing effort levels for curated models, then re-add
    // the recommended ones. This is a reset, not an additive operation.
    const toRemove = models.filter(
      (m) => curatedIds.has(m.modelId) && m.effort,
    );

    const toAdd = curated
      .filter((m) => !m.excludeFromDefaults)
      .map((m) => ({
        modelId: m.modelId,
        displayName: m.modelId,
        effort: RECOMMENDED_EFFORT,
      }));

    // Debounce the busy state so the button label doesn't flash on fast operations.
    busyTimer.current = setTimeout(() => setBusy("__defaults__"), 200);
    setError(null);
    try {
      for (const item of toRemove) {
        await api.removeProviderModel(providerId, item.modelId, item.effort);
      }
      const added = await api.addProviderModels(providerId, toAdd);
      onChanged();
      showStatus(
        `Defaults applied — ${added.models.length} model(s) set to ${RECOMMENDED_EFFORT}.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (busyTimer.current !== null) {
        clearTimeout(busyTimer.current);
        busyTimer.current = null;
      }
      setBusy(null);
    }
  };

  return (
    <div className="subscription-model-checklist">
      <div className="checklist-actions">
        {status && <span className="checklist-status">{status}</span>}
        <button
          type="button"
          className="secondary"
          onClick={() => void applyDefaults()}
          disabled={busy !== null}
          title={`Remove all effort levels for curated models and reset to ${RECOMMENDED_EFFORT}`}
        >
          {busy === "__defaults__"
            ? "resetting…"
            : "reset to recommended defaults"}
        </button>
      </div>
      {curated.map(({ modelId }) => (
        <div key={modelId} className="model-effort-row">
          <span className="provider-model-id">{modelId}</span>
          <div className="effort-pills">
            {EFFORTS.map((eff) => {
              const key = cellKey(modelId, eff);
              const on = enabled.has(key);
              return (
                <button
                  key={eff}
                  type="button"
                  className={`effort-pill${on ? " on" : ""}`}
                  disabled={busy === key}
                  onClick={() => void toggle(modelId, eff, !on)}
                >
                  {eff}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {customModels.length > 0 && (
        <div className="checklist-custom-header">custom</div>
      )}
      {customModels.map((m) => {
        const key = cellKey(m.modelId, m.effort);
        return (
          <div key={m.id} className="model-effort-row">
            <span className="provider-model-id">{m.modelId}</span>
            <div className="effort-pills">
              <span className="effort-pill on" aria-readonly>
                {m.effort || "—"}
              </span>
              <button
                type="button"
                className="danger"
                disabled={busy === key}
                onClick={() => void removeCustom(m.modelId, m.effort)}
                title={`Remove ${m.modelId} (${m.effort || "no effort"})`}
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
      {error && <div className="callout-error">{error}</div>}
    </div>
  );
}
