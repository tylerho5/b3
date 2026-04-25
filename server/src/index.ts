import { handleRequest } from "./api/routes";
import { makeWebSocketHandler } from "./api/ws";
import { createAppState } from "./state/app";

const PORT = Number(process.env.B3_PORT ?? 4477);

const app = createAppState();
const wsHandler = makeWebSocketHandler(app);

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const ok = srv.upgrade(req, {
        data: { matrixRunId: null, unsubscribe: null },
      });
      if (ok) return undefined as unknown as Response;
      return new Response("ws upgrade failed", { status: 400 });
    }
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleRequest(app, req);
      } catch (err) {
        return new Response(
          JSON.stringify({ error: (err as Error).message }),
          { status: 500, headers: { "content-type": "application/json" } },
        );
      }
    }
    return new Response("b3 server", { status: 200 });
  },
  websocket: wsHandler,
});

console.log(`b3 server listening on http://${server.hostname}:${server.port}`);
