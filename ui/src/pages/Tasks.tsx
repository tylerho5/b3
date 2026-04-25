import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { RefinedTask, Task, TaskInput } from "../types/shared";
import { TaskList } from "../components/TaskList";
import { TaskEditor } from "../components/TaskEditor";
import { RefinerModal } from "../components/RefinerModal";
import "../styles/tasks.css";

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refinerOpen, setRefinerOpen] = useState(false);
  const [refinerNotes, setRefinerNotes] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const list = await api.listTasks();
      setTasks(list);
      if (selectedId && !list.some((t) => t.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const selected = tasks.find((t) => t.id === selectedId) ?? null;

  const onSave = async (input: TaskInput, id: string | null) => {
    if (id) {
      const updated = await api.patchTask(id, input);
      setTasks((cur) => cur.map((t) => (t.id === id ? updated : t)));
    } else {
      const created = await api.createTask(input);
      setTasks((cur) => [created, ...cur]);
      setSelectedId(created.id);
    }
    setRefinerNotes(null);
  };

  const onDelete = async (id: string) => {
    if (!confirm("delete this task?")) return;
    await api.deleteTask(id);
    setTasks((cur) => cur.filter((t) => t.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const onApplyRefiner = (r: RefinedTask) => {
    setSelectedId(null);
    setRefinerNotes(r.notes);
    // Pre-populate the editor with the refined values, then immediately
    // create the task so the user can edit it as a real persisted record.
    const input: TaskInput = {
      name: r.name,
      prompt: r.prompt,
      baseRepo: null,
      baseCommit: null,
      testCommand: r.test_command || null,
      timeBudgetS: 600,
      judgeEnabled: false,
    };
    void (async () => {
      const created = await api.createTask(input);
      setTasks((cur) => [created, ...cur]);
      setSelectedId(created.id);
    })();
  };

  return (
    <div className="tasks-page">
      <TaskList
        tasks={tasks}
        filter={filter}
        onFilterChange={setFilter}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setRefinerNotes(null);
        }}
        onNew={() => {
          setSelectedId(null);
          setRefinerNotes(null);
        }}
      />
      <TaskEditor
        task={selected}
        onSave={onSave}
        onDelete={onDelete}
        onOpenRefiner={() => setRefinerOpen(true)}
        refinerNotes={selectedId ? null : refinerNotes}
      />
      <RefinerModal
        open={refinerOpen}
        onClose={() => setRefinerOpen(false)}
        onApply={onApplyRefiner}
      />
      {error && (
        <div className="refiner-error" style={{ position: "fixed", bottom: 20, right: 20 }}>
          {error}
        </div>
      )}
    </div>
  );
}
