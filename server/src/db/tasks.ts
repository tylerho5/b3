import { ulid } from "ulid";
import type { DB } from "./index";

export interface Task {
  id: string;
  name: string;
  prompt: string;
  baseRepo: string | null;
  baseCommit: string | null;
  testCommand: string | null;
  timeBudgetS: number;
  judgeEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  name: string;
  prompt: string;
  baseRepo: string | null;
  baseCommit: string | null;
  testCommand: string | null;
  timeBudgetS: number;
  judgeEnabled: boolean;
}

interface TaskRow {
  id: string;
  name: string;
  prompt: string;
  base_repo: string | null;
  base_commit: string | null;
  test_command: string | null;
  time_budget_s: number;
  judge_enabled: number;
  created_at: string;
  updated_at: string;
}

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    name: r.name,
    prompt: r.prompt,
    baseRepo: r.base_repo,
    baseCommit: r.base_commit,
    testCommand: r.test_command,
    timeBudgetS: r.time_budget_s,
    judgeEnabled: r.judge_enabled === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function createTask(db: DB, input: TaskInput): string {
  const id = ulid();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO tasks (id, name, prompt, base_repo, base_commit, test_command,
                        time_budget_s, judge_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.prompt,
      input.baseRepo,
      input.baseCommit,
      input.testCommand,
      input.timeBudgetS,
      input.judgeEnabled ? 1 : 0,
      now,
      now,
    ],
  );
  return id;
}

export function getTask(db: DB, id: string): Task | null {
  const row = db.query("SELECT * FROM tasks WHERE id = ?").get(id) as
    | TaskRow
    | undefined;
  return row ? rowToTask(row) : null;
}

export function listTasks(db: DB): Task[] {
  const rows = db
    .query("SELECT * FROM tasks ORDER BY created_at DESC")
    .all() as TaskRow[];
  return rows.map(rowToTask);
}

const UPDATABLE: Record<keyof Omit<TaskInput, never>, string> = {
  name: "name",
  prompt: "prompt",
  baseRepo: "base_repo",
  baseCommit: "base_commit",
  testCommand: "test_command",
  timeBudgetS: "time_budget_s",
  judgeEnabled: "judge_enabled",
};

export function updateTask(
  db: DB,
  id: string,
  patch: Partial<TaskInput>,
): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    const col = UPDATABLE[k as keyof TaskInput];
    if (!col) continue;
    sets.push(`${col} = ?`);
    vals.push(k === "judgeEnabled" ? (v ? 1 : 0) : v);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  vals.push(new Date().toISOString());
  vals.push(id);
  db.run(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, vals as never[]);
}

export function deleteTask(db: DB, id: string): void {
  db.run("DELETE FROM tasks WHERE id = ?", [id]);
}
