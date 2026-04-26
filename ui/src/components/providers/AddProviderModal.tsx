import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type {
  Provider,
  ProviderKind,
  ProviderModel,
} from "../../types/shared";
import { DEFAULT_MODELS } from "./defaultModels";

type AddableKind =
  | "anthropic_api_direct"
  | "openai_api_direct"
  | "custom_anthropic_compat"
  | "custom_openai_compat";

const KIND_LABEL: Record<AddableKind, string> = {
  anthropic_api_direct: "Anthropic (direct API)",
  openai_api_direct: "OpenAI (direct API)",
  custom_anthropic_compat: "Custom Anthropic-compatible",
  custom_openai_compat: "Custom OpenAI-compatible",
};

const KIND_HINT: Record<AddableKind, string> = {
  anthropic_api_direct: "ANTHROPIC_API_KEY",
  openai_api_direct: "OPENAI_API_KEY",
  custom_anthropic_compat: "Self-hosted or third-party Messages API",
  custom_openai_compat: "Self-hosted or third-party Chat Completions API",
};

interface Form {
  kind: AddableKind;
  name: string;
  baseUrl: string;
  keyMode: "paste" | "env";
  apiKey: string;
  apiKeyEnvRef: string;
}

const emptyForm: Form = {
  kind: "anthropic_api_direct",
  name: "",
  baseUrl: "",
  keyMode: "paste",
  apiKey: "",
  apiKeyEnvRef: "",
};

export function AddProviderModal({
  editing,
  existingModels,
  onClose,
  onSaved,
}: {
  editing: Provider | null;
  existingModels?: ProviderModel[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<"pick" | "form">(
    editing ? "form" : "pick",
  );
  const [form, setForm] = useState<Form>(() => {
    if (editing && isAddableKind(editing.kind)) {
      return {
        kind: editing.kind,
        name: editing.name,
        baseUrl: editing.baseUrl ?? "",
        keyMode: editing.apiKeyEnvRef ? "env" : "paste",
        apiKey: editing.apiKey ?? "",
        apiKeyEnvRef: editing.apiKeyEnvRef ?? "",
      };
    }
    return emptyForm;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setError(null);
  }, [editing]);

  const requiresBaseUrl = form.kind.startsWith("custom_");

  const setF = (patch: Partial<Form>) =>
    setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        kind: form.kind,
        baseUrl: requiresBaseUrl ? form.baseUrl.trim() : null,
        apiKey: form.keyMode === "paste" ? form.apiKey || null : null,
        apiKeyEnvRef:
          form.keyMode === "env" ? form.apiKeyEnvRef.trim() || null : null,
      };
      let provider: Provider;
      if (editing) {
        provider = await api.updateProvider(editing.id, {
          name: payload.name,
          baseUrl: payload.baseUrl,
          apiKey: payload.apiKey,
          apiKeyEnvRef: payload.apiKeyEnvRef,
        });
      } else {
        provider = await api.createProvider(payload);
        const seeds = DEFAULT_MODELS[provider.kind];
        if (seeds && seeds.length > 0) {
          await api.addProviderModels(provider.id, seeds);
        }
      }
      const probe = await api.probeProvider(provider.id);
      if (!probe.ok) {
        setError(`probe failed: ${probe.message}`);
        setSaving(false);
        return;
      }
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const formValid =
    form.name.trim().length > 0 &&
    (requiresBaseUrl ? form.baseUrl.trim().length > 0 : true) &&
    (form.keyMode === "paste"
      ? form.apiKey.length > 0
      : form.apiKeyEnvRef.trim().length > 0);

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-content">
        <div className="modal-header">
          {editing ? `edit ${editing.name}` : "add provider"}
        </div>

        {step === "pick" && !editing ? (
          <div className="modal-body">
            <p className="meta-line dim">Pick a provider type:</p>
            <div className="kind-picker">
              {(Object.keys(KIND_LABEL) as AddableKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="kind-tile"
                  onClick={() => {
                    setF({ kind: k, name: defaultName(k) });
                    setStep("form");
                  }}
                >
                  <strong>{KIND_LABEL[k]}</strong>
                  <span className="meta-label">{KIND_HINT[k]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <div className="form-row">
              <label className="form-label">name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setF({ name: e.target.value })}
              />
            </div>

            {!editing && (
              <div className="form-row">
                <label className="form-label">kind</label>
                <code className="form-static">{KIND_LABEL[form.kind]}</code>
              </div>
            )}

            {requiresBaseUrl && (
              <div className="form-row">
                <label className="form-label">base url</label>
                <input
                  type="text"
                  value={form.baseUrl}
                  onChange={(e) => setF({ baseUrl: e.target.value })}
                  placeholder="https://api.example.com"
                />
              </div>
            )}

            <div className="form-row">
              <label className="form-label">api key</label>
              <div className="key-toggle">
                <label>
                  <input
                    type="radio"
                    name={`key-mode-${editing?.id ?? "new"}`}
                    checked={form.keyMode === "paste"}
                    onChange={() => setF({ keyMode: "paste" })}
                  />
                  paste
                </label>
                <label>
                  <input
                    type="radio"
                    name={`key-mode-${editing?.id ?? "new"}`}
                    checked={form.keyMode === "env"}
                    onChange={() => setF({ keyMode: "env" })}
                  />
                  env var
                </label>
              </div>
            </div>
            {form.keyMode === "paste" ? (
              <div className="form-row">
                <label className="form-label" />
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setF({ apiKey: e.target.value })}
                  placeholder={
                    editing && editing.apiKey
                      ? "(leave blank to keep stored key)"
                      : "sk-…"
                  }
                />
              </div>
            ) : (
              <div className="form-row">
                <label className="form-label" />
                <input
                  type="text"
                  value={form.apiKeyEnvRef}
                  onChange={(e) => setF({ apiKeyEnvRef: e.target.value })}
                  placeholder={KIND_HINT[form.kind]}
                />
              </div>
            )}

            {!editing && DEFAULT_MODELS[form.kind] && (
              <p className="meta-line dim">
                Will seed {DEFAULT_MODELS[form.kind]?.length} default
                models. Edit later from the provider row.
              </p>
            )}

            {editing && existingModels && (
              <div className="form-row">
                <label className="form-label">models</label>
                <code>{existingModels.length} configured</code>
              </div>
            )}

            {error && <div className="callout-error">{error}</div>}
          </div>
        )}

        <div className="modal-footer">
          {step === "form" && !editing && (
            <button
              type="button"
              className="secondary"
              onClick={() => setStep("pick")}
            >
              back
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="secondary" onClick={onClose}>
            cancel
          </button>
          {step === "form" && (
            <button
              type="button"
              className="primary"
              onClick={() => void submit()}
              disabled={!formValid || saving}
            >
              {saving ? "saving…" : editing ? "save" : "create"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function isAddableKind(kind: ProviderKind): kind is AddableKind {
  return (
    kind === "anthropic_api_direct" ||
    kind === "openai_api_direct" ||
    kind === "custom_anthropic_compat" ||
    kind === "custom_openai_compat"
  );
}

function defaultName(kind: AddableKind): string {
  switch (kind) {
    case "anthropic_api_direct":
      return "Anthropic";
    case "openai_api_direct":
      return "OpenAI";
    case "custom_anthropic_compat":
      return "Custom Anthropic";
    case "custom_openai_compat":
      return "Custom OpenAI";
  }
}
