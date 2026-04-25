import type { Task } from "../types/shared";

export function TaskList({
  tasks,
  filter,
  onFilterChange,
  selectedId,
  onSelect,
  onNew,
}: {
  tasks: Task[];
  filter: string;
  onFilterChange: (s: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const lower = filter.trim().toLowerCase();
  const filtered = lower
    ? tasks.filter(
        (t) =>
          t.name.toLowerCase().includes(lower) ||
          t.prompt.toLowerCase().includes(lower),
      )
    : tasks;

  return (
    <div className="tasks-list">
      <div className="tasks-list-header">
        <input
          type="text"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="search…"
        />
        <button className="primary" type="button" onClick={onNew}>
          + new
        </button>
      </div>
      {filtered.length === 0 ? (
        <div className="tasks-list-empty">no tasks yet</div>
      ) : (
        filtered.map((t) => (
          <a
            key={t.id}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onSelect(t.id);
            }}
            className={"sb-item" + (t.id === selectedId ? " active" : "")}
          >
            {t.name}
          </a>
        ))
      )}
    </div>
  );
}
