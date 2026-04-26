import { useEffect, useState } from "react";
import { api } from "../../api/client";

export function JudgeTemplateEditor() {
  const [original, setOriginal] = useState<string>("");
  const [value, setValue] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await api.getJudgeTemplate();
        const text = r.template ?? "";
        setOriginal(text);
        setValue(text);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const dirty = !loading && value !== original;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.putJudgeTemplate(value);
      setOriginal(value);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="judge-editor">
      <div className="judge-editor-toolbar">
        {savedAt && (
          <span className="meta-label">saved {savedAt}</span>
        )}
        {dirty && <span className="meta-label dirty">unsaved changes</span>}
        <span className="spacer" />
        <button
          type="button"
          className="primary"
          onClick={() => void save()}
          disabled={!dirty || saving}
        >
          {saving ? "saving…" : "save"}
        </button>
      </div>
      <textarea
        className="judge-textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={
          loading
            ? "loading…"
            : "Prompt the judge model uses to score runs. Supports {task_name}, {task_prompt}, {test_command}, {test_status}, {run_path} placeholders."
        }
        spellCheck={false}
        disabled={loading}
      />
      {error && <div className="callout-error">{error}</div>}
    </div>
  );
}
