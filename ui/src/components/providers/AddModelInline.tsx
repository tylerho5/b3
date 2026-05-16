import { useState } from "react";
import { api } from "../../api/client";
import type { ProviderKind } from "../../types/shared";

interface Props {
  providerId: string;
  providerKind: ProviderKind;
  onAdded: () => void;
  onCancel: () => void;
}

function showContextLength(kind: ProviderKind): boolean {
  return (
    kind === "anthropic_api_direct" ||
    kind === "openai_api_direct" ||
    kind === "custom_anthropic_compat" ||
    kind === "custom_openai_compat"
  );
}

function showPricing(kind: ProviderKind): boolean {
  return (
    kind === "anthropic_api_direct" ||
    kind === "openai_api_direct" ||
    kind === "custom_anthropic_compat" ||
    kind === "custom_openai_compat"
  );
}

function pricingRequired(kind: ProviderKind): boolean {
  return kind === "anthropic_api_direct" || kind === "openai_api_direct";
}

function validateModelId(v: string): boolean {
  return v.trim() !== "";
}

function validatePricing(kind: ProviderKind, inputCost: string, outputCost: string): boolean {
  if (!showPricing(kind)) return true;
  if (!pricingRequired(kind)) return true;
  return inputCost.trim() !== "" && outputCost.trim() !== "";
}

function validateNumberField(v: string): boolean {
  return v.trim() === "" || !isNaN(Number(v));
}

export function AddModelInline({ providerId, providerKind, onAdded, onCancel }: Props) {
  const [modelId, setModelId] = useState("");
  const [contextLength, setContextLength] = useState("");
  const [inputCost, setInputCost] = useState("");
  const [outputCost, setOutputCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    validateModelId(modelId) &&
    validatePricing(providerKind, inputCost, outputCost) &&
    (!showContextLength(providerKind) || validateNumberField(contextLength)) &&
    (!showPricing(providerKind) || validateNumberField(inputCost)) &&
    (!showPricing(providerKind) || validateNumberField(outputCost));

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const id = modelId.trim();
      await api.addProviderModels(providerId, [
        {
          modelId: id,
          displayName: id,
          contextLength: showContextLength(providerKind) && contextLength.trim()
            ? Number(contextLength)
            : undefined,
          inputCostPerMtok: showPricing(providerKind) && inputCost.trim()
            ? Number(inputCost)
            : undefined,
          outputCostPerMtok: showPricing(providerKind) && outputCost.trim()
            ? Number(outputCost)
            : undefined,
        },
      ]);
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="add-model-inline">
      <div className="form-row">
        <span className="form-label">Model ID</span>
        <input
          type="text"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder="claude-opus-4-7"
          disabled={saving}
        />
      </div>
      {showContextLength(providerKind) && (
        <div className="form-row">
          <span className="form-label">Context length</span>
          <input
            type="text"
            value={contextLength}
            onChange={(e) => setContextLength(e.target.value)}
            placeholder="200000"
            disabled={saving}
          />
        </div>
      )}
      {showPricing(providerKind) && (
        <>
          <div className="form-row">
            <span className="form-label">Input $/MTok</span>
            <input
              type="text"
              value={inputCost}
              onChange={(e) => setInputCost(e.target.value)}
              placeholder={pricingRequired(providerKind) ? "3.00" : "optional"}
              disabled={saving}
            />
          </div>
          <div className="form-row">
            <span className="form-label">Output $/MTok</span>
            <input
              type="text"
              value={outputCost}
              onChange={(e) => setOutputCost(e.target.value)}
              placeholder={pricingRequired(providerKind) ? "15.00" : "optional"}
              disabled={saving}
            />
          </div>
        </>
      )}
      {error && <div className="callout-error">{error}</div>}
      <div className="add-model-inline-actions">
        <button
          type="button"
          className="secondary"
          onClick={onCancel}
          disabled={saving}
        >
          cancel
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => void submit()}
          disabled={!valid || saving}
        >
          {saving ? "adding…" : "add model"}
        </button>
      </div>
    </div>
  );
}
