import { useEffect, useState } from "react";
import type { Task, TaskInput } from "../types/shared";

export function TaskEditor({
  task,
  onSave,
  onDelete,
  onOpenRefiner,
  refinerNotes,
}: {
  task: Task | null;
  onSave: (input: TaskInput, id: string | null) => Promise<void>;
  onDelete: (id: string) => void;
  onOpenRefiner: () => void;
  refinerNotes: string | null;
}) {
  const [draft, setDraft] = useState<TaskInput>(emptyDraft());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) {
      setDraft({
        name: task.name,
        prompt: task.prompt,
        baseRepo: task.baseRepo,
        baseCommit: task.baseCommit,
        testCommand: task.testCommand,
        timeBudgetS: task.timeBudgetS,
        judgeEnabled: task.judgeEnabled,
      });
    } else {
      setDraft(emptyDraft());
    }
  }, [task]);

  const save = async () => {
    if (!draft.name?.trim() || !draft.prompt?.trim()) return;
    setSaving(true);
    try {
      await onSave(draft, task?.id ?? null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="task-editor">
      <div className="task-editor-toolbar">
        <button
          type="button"
          className="secondary"
          onClick={onOpenRefiner}
        >
          ✨ refine with claude code
        </button>
        <div className="spacer" />
        {task && (
          <button
            type="button"
            className="danger"
            onClick={() => onDelete(task.id)}
          >
            delete
          </button>
        )}
        <button
          type="button"
          className="primary"
          onClick={save}
          disabled={saving}
        >
          {saving ? "saving…" : task ? "save" : "create"}
        </button>
      </div>

      {refinerNotes && (
        <div className="refiner-notes">✨ refiner notes: {refinerNotes}</div>
      )}

      <div className="field">
        <label>name</label>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </div>

      <div className="field">
        <label>prompt</label>
        <textarea
          className="prompt"
          value={draft.prompt}
          onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
        />
      </div>

      <div className="row">
        <div className="field">
          <label>base repo (path)</label>
          <input
            type="text"
            value={draft.baseRepo ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, baseRepo: e.target.value || null })
            }
            placeholder="(blank = empty git init)"
          />
        </div>
        <div className="field">
          <label>base commit (sha)</label>
          <input
            type="text"
            value={draft.baseCommit ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, baseCommit: e.target.value || null })
            }
          />
        </div>
      </div>

      <div className="field">
        <label>test command</label>
        <input
          type="text"
          value={draft.testCommand ?? ""}
          onChange={(e) =>
            setDraft({ ...draft, testCommand: e.target.value || null })
          }
          placeholder="(blank = no test phase)"
        />
      </div>

      <div className="row">
        <div className="field">
          <label>time budget (s)</label>
          <input
            type="number"
            value={draft.timeBudgetS ?? 600}
            onChange={(e) =>
              setDraft({
                ...draft,
                timeBudgetS: Math.max(1, Number(e.target.value)),
              })
            }
          />
        </div>
        <div
          className="field"
          style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <input
            type="checkbox"
            id="judge"
            checked={!!draft.judgeEnabled}
            onChange={(e) =>
              setDraft({ ...draft, judgeEnabled: e.target.checked })
            }
          />
          <label htmlFor="judge" style={{ marginBottom: 0 }}>
            enable judge prompt
          </label>
        </div>
      </div>
    </div>
  );
}

function emptyDraft(): TaskInput {
  return {
    name: "",
    prompt: "",
    baseRepo: null,
    baseCommit: null,
    testCommand: null,
    timeBudgetS: 600,
    judgeEnabled: false,
  };
}
