import type {
  Task,
  TaskInput,
  RefinedTask,
  ProviderConfig,
  Provider,
  ProviderModel,
  ProviderModelInput,
  CreateProviderInput,
  UpdateProviderInput,
  ProviderProbeResult,
  OpenRouterCatalog,
  SubscriptionStatus,
  Harness,
  SkillBundle,
  MatrixRun,
  MatrixEstimate,
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
    tomlText: string | null;
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

  async listProviders(): Promise<{
    providers: Provider[];
    models: ProviderModel[];
  }> {
    return jsonOrThrow(await fetch("/api/providers"));
  },
  async createProvider(input: CreateProviderInput): Promise<Provider> {
    return jsonOrThrow(
      await fetch("/api/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    );
  },
  async updateProvider(
    id: string,
    patch: UpdateProviderInput,
  ): Promise<Provider> {
    return jsonOrThrow(
      await fetch(`/api/providers/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }),
    );
  },
  async deleteProvider(id: string): Promise<void> {
    const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(res.statusText);
  },
  async addProviderModels(
    providerId: string,
    models: ProviderModelInput[],
  ): Promise<{ models: ProviderModel[] }> {
    return jsonOrThrow(
      await fetch(`/api/providers/${providerId}/models`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ models }),
      }),
    );
  },
  async removeProviderModel(
    providerId: string,
    modelId: string,
  ): Promise<void> {
    const res = await fetch(
      `/api/providers/${providerId}/models/${encodeURIComponent(modelId)}`,
      { method: "DELETE" },
    );
    if (!res.ok) throw new Error(res.statusText);
  },
  async probeProvider(id: string): Promise<ProviderProbeResult> {
    return jsonOrThrow(
      await fetch(`/api/providers/${id}/probe`, { method: "POST" }),
    );
  },
  async getOpenRouterCatalog(providerId: string): Promise<OpenRouterCatalog> {
    return jsonOrThrow(
      await fetch(
        `/api/providers/openrouter/catalog?providerId=${encodeURIComponent(providerId)}`,
      ),
    );
  },
  async exportProvidersToml(): Promise<string> {
    const res = await fetch("/api/providers/export");
    if (!res.ok) throw new Error(res.statusText);
    return res.text();
  },
  async importProvidersToml(
    toml: string,
    replace: boolean,
  ): Promise<{ ok: true } & Record<string, unknown>> {
    return jsonOrThrow(
      await fetch("/api/providers/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toml, replace }),
      }),
    );
  },
  async getSubscriptionStatus(harness: Harness): Promise<SubscriptionStatus> {
    return jsonOrThrow(
      await fetch(`/api/subscriptions/status?harness=${harness}`),
    );
  },
  async getJudgeTemplate(): Promise<{ template: string | null }> {
    return jsonOrThrow(await fetch("/api/settings/judge"));
  },
  async putJudgeTemplate(template: string): Promise<void> {
    const res = await fetch("/api/settings/judge", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ template }),
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
  async estimateRuns(
    cells: Array<{ harness: string; providerId: string; modelId: string }>,
  ): Promise<MatrixEstimate> {
    return jsonOrThrow(
      await fetch("/api/runs/estimate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cells }),
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
