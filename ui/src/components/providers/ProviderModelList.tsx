import { api } from "../../api/client";
import type { ProviderKind, ProviderModel } from "../../types/shared";

function formatPricing(
  model: ProviderModel,
  kind: ProviderKind,
): string {
  if (kind === "claude_subscription" || kind === "codex_subscription") {
    return "subscription";
  }
  if (model.inputCostPerMtok != null && model.outputCostPerMtok != null) {
    return `in $${model.inputCostPerMtok.toFixed(2)} · out $${model.outputCostPerMtok.toFixed(2)}`;
  }
  return "—";
}

interface Props {
  providerId: string;
  providerKind: ProviderKind;
  models: ProviderModel[];
  onChanged: () => void;
}

export function ProviderModelList({
  providerId,
  providerKind,
  models,
  onChanged,
}: Props) {
  if (models.length === 0) {
    return <div className="provider-models-empty">No models yet — add one below.</div>;
  }

  return (
    <div className="provider-model-list">
      {models.map((m) => (
        <div key={m.id} className="provider-model-row">
          <span className="provider-model-id">{m.modelId}</span>
          <div className="provider-model-row-right">
            {m.contextLength != null && (
              <span className="provider-model-stat">
                {m.contextLength.toLocaleString()} ctx
              </span>
            )}
            <span className="provider-model-pricing">
              {formatPricing(m, providerKind)}
            </span>
            <button
              type="button"
              className="danger"
              title={`Remove ${m.modelId}`}
              onClick={() => {
                if (!confirm(`Remove model ${m.modelId}?`)) return;
                api.removeProviderModel(providerId, m.modelId).then(onChanged);
              }}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
