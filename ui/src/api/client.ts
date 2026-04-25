import type {
  Task,
  TaskInput,
  RefinedTask,
  ProviderConfig,
  SkillBundle,
  MatrixRun,
  Run,
  RunSegment,
} from "../types/shared";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg: string;
    try {
      const body = await res.json();
      msg = body.error ?? res.statusText;
      const err: Error & { raw?: string } = new Error(msg);
      err.raw = body.raw;
      throw err;
    } catch {
      msg = res.statusText;
      throw new Error(msg);
    }
  }
  return res.json() as Promise<T>;
}

export const api = {
  async listTasks(): Promise<Task[]> {
    return jsonOrThrow(await fetch("/api/tasks"));
  },
  async createTask(input: TaskInput): Promise<Task> {
    return jsonOrThrow(
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    );
  },
  async getTask(id: string): Promise<Task> {
    return jsonOrThrow(await fetch(`/api/tasks/${id}`));
  },
  async patchTask(id: string, patch: Partial<TaskInput>): Promise<Task> {
    return jsonOrThrow(
      await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }),
    );
  },
  async deleteTask(id: string): Promise<void> {
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(res.statusText);
  },
  async refineTask(
    draft: string,
    signal?: AbortSignal,
  ): Promise<RefinedTask> {
    return jsonOrThrow(
      await fetch("/api/tasks/refine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft }),
        signal,
      }),
    );
  },

  async getProviders(): Promise<{
    version: number;
    judge: { template: string };
    providers: ProviderConfig[];
  }> {
    return jsonOrThrow(await fetch("/api/providers"));
  },
  async putProviders(toml: string): Promise<void> {
    const res = await fetch("/api/providers", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toml }),
    });
    if (!res.ok) throw new Error(res.statusText);
  },

  async getSkills(): Promise<SkillBundle[]> {
    return jsonOrThrow(await fetch("/api/skills"));
  },

  async listMatrixRuns(): Promise<MatrixRun[]> {
    return jsonOrThrow(await fetch("/api/runs"));
  },
  async getMatrixRun(
    matrixId: string,
  ): Promise<{ matrixRun: MatrixRun; cells: Run[] }> {
    return jsonOrThrow(await fetch(`/api/runs/${matrixId}`));
  },
  async getRunDetail(
    matrixId: string,
    runId: string,
  ): Promise<{
    run: Run;
    segments: RunSegment[];
    events: { id: number; type: string; tsMs: number; payload: unknown }[];
    diff: string | null;
    meta: unknown;
    testLog: string | null;
  }> {
    return jsonOrThrow(await fetch(`/api/runs/${matrixId}/${runId}`));
  },
  async launch(input: {
    taskId: string;
    matrix: Array<{ harness: string; providerId: string; modelId: string }>;
    skillIds?: string[];
    concurrency?: number;
  }): Promise<{ matrixRunId: string; cellRunIds: string[] }> {
    return jsonOrThrow(
      await fetch("/api/runs/launch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    );
  },
  async cancel(matrixId: string): Promise<void> {
    const res = await fetch(`/api/runs/${matrixId}/cancel`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(res.statusText);
  },
  async broadcast(
    matrixId: string,
    text: string,
    mode: "wait" | "immediate",
  ): Promise<void> {
    const res = await fetch(`/api/runs/${matrixId}/broadcast`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, mode }),
    });
    if (!res.ok) throw new Error(res.statusText);
  },
  async sendMessage(
    matrixId: string,
    runId: string,
    text: string,
  ): Promise<void> {
    const res = await fetch(`/api/runs/${matrixId}/${runId}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(res.statusText);
  },
  async judgePrompt(
    matrixId: string,
    runId: string,
  ): Promise<{ prompt: string }> {
    return jsonOrThrow(
      await fetch(`/api/runs/${matrixId}/${runId}/judge-prompt`),
    );
  },
  async submitJudge(
    matrixId: string,
    runId: string,
    score: number,
    notes: string,
  ): Promise<void> {
    const res = await fetch(`/api/runs/${matrixId}/${runId}/judge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ score, notes }),
    });
    if (!res.ok) throw new Error(res.statusText);
  },
};
