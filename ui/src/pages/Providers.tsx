import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { ProviderConfig } from "../types/shared";
import "../styles/providers.css";

export function Providers() {
  const [toml, setToml] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [original, setOriginal] = useState<string>("");

  const refresh = async () => {
    const r = await api.getProviders();
    setProviders(r.providers);
    if (r.tomlText != null) {
      setOriginal(r.tomlText);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const r = await api.getProviders();
        setProviders(r.providers);
        const text = r.tomlText ?? "";
        setToml(text);
        setOriginal(text);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const save = async () => {
    if (toml == null) return;
    setSaving(true);
    setError(null);
    try {
      await api.putProviders(toml);
      setOriginal(toml);
      setSavedAt(new Date().toLocaleTimeString());
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const dirty = toml != null && toml !== original;

  return (
    <div className="providers-page">
      <div className="providers-toml-pane">
        <div className="providers-toml-toolbar">
          <strong style={{ fontSize: 13 }}>~/.config/b3/config.toml</strong>
          <span className="spacer" />
          {savedAt && (
            <span className="providers-saved">saved {savedAt}</span>
          )}
          <button
            type="button"
            className="primary"
            disabled={saving || !dirty}
            onClick={save}
          >
            {saving ? "saving…" : "save"}
          </button>
        </div>
        <textarea
          className="providers-toml"
          value={toml ?? ""}
          onChange={(e) => setToml(e.target.value)}
          spellCheck={false}
        />
        {error && (
          <div
            className="refiner-error"
            style={{ margin: 12 }}
          >
            {error}
          </div>
        )}
      </div>

      <div className="providers-summary-pane">
        <h3
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color: "var(--text-muted)",
            margin: "0 0 12px",
          }}
        >
          {providers.length} provider{providers.length === 1 ? "" : "s"} loaded
        </h3>
        {providers.map((p) => (
          <div className="provider-card" key={`${p.harness}:${p.id}`}>
            <div className="ph">{p.harness}</div>
            <h4>
              {p.label}
              <span className="pricing">{p.pricingMode}</span>
            </h4>
            <div className="models">
              {p.models.length === 0 && (
                <span style={{ color: "var(--text-muted)" }}>no models</span>
              )}
              {p.models.map((m) => (
                <span className="model-tag" key={m.id}>
                  {m.id}
                  {m.tier && ` (${m.tier})`}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

