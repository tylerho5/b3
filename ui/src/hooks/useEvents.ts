import { useEffect, useRef, useState } from "react";
import type { WSEnvelope, NormalizedEvent } from "../types/shared";

export interface RunEventStream {
  byRunId: Record<string, NormalizedEvent[]>;
  connected: boolean;
}

export function useEvents(matrixRunId: string | null): RunEventStream {
  const [state, setState] = useState<RunEventStream>({
    byRunId: {},
    connected: false,
  });
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!matrixRunId) {
      setState({ byRunId: {}, connected: false });
      return;
    }
    let cancelled = false;

    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        ws.send(
          JSON.stringify({ type: "subscribe", matrixRunId }),
        );
        setState((s) => ({ ...s, connected: true }));
      });

      ws.addEventListener("message", (msg) => {
        let env: WSEnvelope | { type: string };
        try {
          env = JSON.parse(msg.data) as WSEnvelope | { type: string };
        } catch {
          return;
        }
        if (!("event" in env)) return;
        setState((s) => {
          const arr = s.byRunId[env.runId] ?? [];
          return {
            ...s,
            byRunId: {
              ...s.byRunId,
              [env.runId]: [...arr, env.event],
            },
          };
        });
      });

      ws.addEventListener("close", () => {
        setState((s) => ({ ...s, connected: false }));
        if (cancelled) return;
        reconnectRef.current = setTimeout(connect, 1500);
      });

      ws.addEventListener("error", () => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [matrixRunId]);

  return state;
}
