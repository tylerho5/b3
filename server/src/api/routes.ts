import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  updateTask,
} from "../db/tasks";
import {
  getMatrixRunWithCells,
  getRun,
  listMatrixRuns,
} from "../db/runs";
import { listSegments } from "../db/segments";
import { listEvents } from "../db/events";
import { refineTask } from "../refiner/refine";
import type { AppState } from "../state/app";
import { launchMatrixRun } from "../orchestrator/launch";
import {
  createProvider,
  deleteProvider,
  getProvider,
  listProviders,
  updateProvider,
  type ProviderKind,
} from "../db/providers";
import {
  addProviderModels,
  listAllProviderModels,
  removeProviderModel,
  type AddProviderModelInput,
} from "../db/providerModels";
import {
  PROVIDER_KIND_META,
  requiresBaseUrl,
  requiresCredentials,
} from "../providers/kinds";

interface JsonInit extends ResponseInit {
  status?: number;
}
function json(body: unknown, init: JsonInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function notFound(): Response {
  return json({ error: "not found" }, { status: 404 });
}

function badRequest(message: string): Response {
  return json({ error: message }, { status: 400 });
}

async function readBody<T>(req: Request): Promise<T> {
  return (await req.json()) as T;
}

export async function handleRequest(
  app: AppState,
  req: Request,
): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (path === "/api/health") return json({ ok: true });

  // Tasks
  if (path === "/api/tasks" && method === "GET") {
    return json(listTasks(app.db));
  }
  if (path === "/api/tasks" && method === "POST") {
    const body = await readBody<{
      name: string;
      prompt: string;
      baseRepo?: string | null;
      baseCommit?: string | null;
      testCommand?: string | null;
      timeBudgetS?: number;
      judgeEnabled?: boolean;
    }>(req);
    if (!body?.name || !body?.prompt) {
      return badRequest("name and prompt required");
    }
    const id = createTask(app.db, {
      name: body.name,
      prompt: body.prompt,
      baseRepo: body.baseRepo ?? null,
      baseCommit: body.baseCommit ?? null,
      testCommand: body.testCommand ?? null,
      timeBudgetS: body.timeBudgetS ?? 600,
      judgeEnabled: !!body.judgeEnabled,
    });
    return json(getTask(app.db, id));
  }
  if (path === "/api/tasks/refine" && method === "POST") {
    const body = await readBody<{ draft: string }>(req);
    if (!body?.draft) return badRequest("draft required");
    try {
      const refined = await refineTask({ draft: body.draft });
      return json(refined);
    } catch (e) {
      return json(
        {
          error: (e as Error).message,
          raw: (e as { raw?: string }).raw ?? null,
        },
        { status: 422 },
      );
    }
  }
  const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch) {
    const id = taskMatch[1];
    if (method === "GET") {
      const t = getTask(app.db, id);
      return t ? json(t) : notFound();
    }
    if (method === "PATCH") {
      const body = await readBody<Partial<{
        name: string;
        prompt: string;
        baseRepo: string | null;
        baseCommit: string | null;
        testCommand: string | null;
        timeBudgetS: number;
        judgeEnabled: boolean;
      }>>(req);
      updateTask(app.db, id, body);
      return json(getTask(app.db, id));
    }
    if (method === "DELETE") {
      deleteTask(app.db, id);
      return json({ ok: true });
    }
  }

  // Providers
  if (path === "/api/providers" && method === "GET") {
    return json({
      providers: listProviders(app.db),
      models: listAllProviderModels(app.db),
    });
  }
  if (path === "/api/providers" && method === "PUT") {
    return json(
      { error: "PUT /api/providers removed; use POST/PATCH/DELETE on DB-backed routes" },
      { status: 410 },
    );
  }
  if (path === "/api/providers" && method === "POST") {
    const body = await readBody<{
      name?: string;
      kind?: string;
      baseUrl?: string | null;
      apiKey?: string | null;
      apiKeyEnvRef?: string | null;
    }>(req);
    if (!body?.name || !body?.kind) {
      return badRequest("name and kind required");
    }
    if (!(body.kind in PROVIDER_KIND_META)) {
      return badRequest(`invalid kind: ${body.kind}`);
    }
    const kind = body.kind as ProviderKind;
    if (requiresBaseUrl(kind) && !body.baseUrl) {
      return badRequest(`kind ${kind} requires baseUrl`);
    }
    if (
      requiresCredentials(kind) &&
      !body.apiKey &&
      !body.apiKeyEnvRef
    ) {
      return badRequest(`kind ${kind} requires credentials (apiKey or apiKeyEnvRef)`);
    }
    const created = createProvider(app.db, {
      name: body.name,
      kind,
      baseUrl: body.baseUrl ?? null,
      apiKey: body.apiKey ?? null,
      apiKeyEnvRef: body.apiKeyEnvRef ?? null,
    });
    return json(created);
  }

  const providerById = path.match(/^\/api\/providers\/([^/]+)$/);
  if (providerById) {
    const id = providerById[1];
    if (method === "PATCH") {
      const existing = getProvider(app.db, id);
      if (!existing) return notFound();
      const body = await readBody<{
        name?: string;
        baseUrl?: string | null;
        apiKey?: string | null;
        apiKeyEnvRef?: string | null;
      }>(req);
      const updated = updateProvider(app.db, id, body);
      return json(updated);
    }
    if (method === "DELETE") {
      const existing = getProvider(app.db, id);
      if (!existing) return notFound();
      deleteProvider(app.db, id);
      return json({ ok: true });
    }
  }

  const providerModels = path.match(/^\/api\/providers\/([^/]+)\/models$/);
  if (providerModels && method === "POST") {
    const id = providerModels[1];
    if (!getProvider(app.db, id)) return notFound();
    const body = await readBody<{ models?: AddProviderModelInput[] }>(req);
    if (!Array.isArray(body?.models)) {
      return badRequest("models array required");
    }
    const added = addProviderModels(app.db, id, body.models);
    return json({ models: added });
  }

  const providerModelById = path.match(
    /^\/api\/providers\/([^/]+)\/models\/(.+)$/,
  );
  if (providerModelById && method === "DELETE") {
    const [, id, encodedModelId] = providerModelById;
    if (!getProvider(app.db, id)) return notFound();
    const modelId = decodeURIComponent(encodedModelId);
    removeProviderModel(app.db, id, modelId);
    return json({ ok: true });
  }

  // Skills
  if (path === "/api/skills" && method === "GET") {
    app.reloadSkills();
    return json(app.skills);
  }

  // Runs (matrix-level list)
  if (path === "/api/runs" && method === "GET") {
    return json(listMatrixRuns(app.db));
  }
  if (path === "/api/runs/launch" && method === "POST") {
    const body = await readBody<{
      taskId: string;
      matrix: Array<{
        harness: "claude_code" | "codex";
        providerId: string;
        modelId: string;
      }>;
      skillIds?: string[];
      concurrency?: number;
    }>(req);
    if (!body?.taskId || !Array.isArray(body.matrix)) {
      return badRequest("taskId and matrix required");
    }
    try {
      const result = launchMatrixRun(app, {
        taskId: body.taskId,
        matrix: body.matrix,
        skillIds: body.skillIds ?? [],
        concurrency: body.concurrency ?? 4,
      });
      return json(result);
    } catch (e) {
      return badRequest((e as Error).message);
    }
  }

  const matrixCancel = path.match(/^\/api\/runs\/([^/]+)\/cancel$/);
  if (matrixCancel && method === "POST") {
    const matrixId = matrixCancel[1];
    const active = app.active.get(matrixId);
    if (!active) return notFound();
    active.handle.cancel();
    return json({ ok: true });
  }

  const matrixBroadcast = path.match(/^\/api\/runs\/([^/]+)\/broadcast$/);
  if (matrixBroadcast && method === "POST") {
    const matrixId = matrixBroadcast[1];
    const active = app.active.get(matrixId);
    if (!active) return notFound();
    const body = await readBody<{
      text: string;
      mode?: "wait" | "immediate";
    }>(req);
    if (!body?.text) return badRequest("text required");
    await active.broadcast.broadcast({
      text: body.text,
      mode: body.mode ?? "wait",
    });
    return json({ ok: true });
  }

  const matrixDetail = path.match(/^\/api\/runs\/([^/]+)$/);
  if (matrixDetail && method === "GET") {
    const matrixId = matrixDetail[1];
    const result = getMatrixRunWithCells(app.db, matrixId);
    return result ? json(result) : notFound();
  }

  const runMessage = path.match(
    /^\/api\/runs\/([^/]+)\/([^/]+)\/message$/,
  );
  if (runMessage && method === "POST") {
    const [, matrixId, runId] = runMessage;
    const active = app.active.get(matrixId);
    if (!active) return notFound();
    const body = await readBody<{ text: string }>(req);
    if (!body?.text) return badRequest("text required");
    // For per-session message, route through broadcast register's inject map
    // by making a single-target broadcast in immediate mode after temporarily
    // reducing the target set. Simpler: call the registered injector directly
    // via the broadcast queue's internal interface — but to keep types clean,
    // reuse broadcast immediate by checking that this runId is the target.
    const ok = await deliverPerSession(active.broadcast, runId, body.text);
    return ok
      ? json({ ok: true })
      : json({ error: "session not active" }, { status: 409 });
  }

  const judgePrompt = path.match(
    /^\/api\/runs\/([^/]+)\/([^/]+)\/judge-prompt$/,
  );
  if (judgePrompt && method === "GET") {
    const [, matrixId, runId] = judgePrompt;
    const run = getRun(app.db, runId);
    if (!run || run.matrixRunId !== matrixId) return notFound();
    const m = getMatrixRunWithCells(app.db, matrixId);
    if (!m) return notFound();
    const task = getTask(app.db, m.matrixRun.taskId);
    if (!task) return notFound();
    const runDir = join(app.runsRoot, runId);
    const tmpl = app.config.judge.template
      .replace("{task_name}", task.name)
      .replace("{task_prompt}", task.prompt)
      .replace("{test_command}", task.testCommand ?? "")
      .replace(
        "{test_status}",
        run.testsPassed == null
          ? "n/a"
          : run.testsPassed
            ? "passed"
            : "failed",
      )
      .replace("{run_path}", runDir);
    return json({ prompt: tmpl });
  }

  const runJudge = path.match(/^\/api\/runs\/([^/]+)\/([^/]+)\/judge$/);
  if (runJudge && method === "POST") {
    const [, matrixId, runId] = runJudge;
    const run = getRun(app.db, runId);
    if (!run || run.matrixRunId !== matrixId) return notFound();
    const body = await readBody<{ score: number; notes: string }>(req);
    app.db.run(
      "UPDATE runs SET judge_score = ?, judge_notes = ? WHERE id = ?",
      [body.score, body.notes ?? "", runId],
    );
    return json({ ok: true });
  }

  const runDetail = path.match(/^\/api\/runs\/([^/]+)\/([^/]+)$/);
  if (runDetail && method === "GET") {
    const [, matrixId, runId] = runDetail;
    const run = getRun(app.db, runId);
    if (!run || run.matrixRunId !== matrixId) return notFound();
    const segments = listSegments(app.db, runId);
    const events = listEvents(app.db, runId);
    const runDir = join(app.runsRoot, runId);
    const diffPath = join(runDir, "workdir.diff");
    const metaPath = join(runDir, "meta.json");
    const testLogPath = join(runDir, "test.log");
    return json({
      run,
      segments,
      events,
      diff: existsSync(diffPath)
        ? readFileSync(diffPath, "utf-8")
        : null,
      meta: existsSync(metaPath)
        ? JSON.parse(readFileSync(metaPath, "utf-8"))
        : null,
      testLog: existsSync(testLogPath)
        ? readFileSync(testLogPath, "utf-8")
        : null,
    });
  }

  return notFound();
}

async function deliverPerSession(
  broadcast: import("../orchestrator/broadcast").BroadcastQueue,
  runId: string,
  text: string,
): Promise<boolean> {
  // BroadcastQueue tracks registrations privately. Per-session inject is a
  // narrow slice over its targets. Implement here by snapshotting the
  // single-session list and calling immediate-mode broadcast restricted to
  // the requested run.
  const inject = (broadcast as unknown as {
    sessions: Map<string, (text: string) => Promise<void>>;
  }).sessions.get(runId);
  if (!inject) return false;
  await inject(text);
  return true;
}
