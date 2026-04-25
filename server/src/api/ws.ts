import type { ServerWebSocket } from "bun";
import type { AppState } from "../state/app";

interface WSData {
  matrixRunId: string | null;
  unsubscribe: (() => void) | null;
}

export function makeWebSocketHandler(app: AppState) {
  return {
    open(ws: ServerWebSocket<WSData>) {
      ws.data.matrixRunId = null;
      ws.data.unsubscribe = null;
    },
    message(ws: ServerWebSocket<WSData>, raw: string | Buffer) {
      let msg: { type: string; matrixRunId?: string };
      try {
        msg = JSON.parse(raw.toString()) as typeof msg;
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "bad json" }));
        return;
      }
      if (msg.type === "subscribe" && typeof msg.matrixRunId === "string") {
        ws.data.unsubscribe?.();
        ws.data.matrixRunId = msg.matrixRunId;
        ws.data.unsubscribe = app.hub.subscribe(msg.matrixRunId, (ev) => {
          ws.send(JSON.stringify(ev));
        });
        ws.send(JSON.stringify({ type: "subscribed", matrixRunId: msg.matrixRunId }));
      } else if (msg.type === "unsubscribe") {
        ws.data.unsubscribe?.();
        ws.data.unsubscribe = null;
        ws.data.matrixRunId = null;
      }
    },
    close(ws: ServerWebSocket<WSData>) {
      ws.data.unsubscribe?.();
    },
  };
}
