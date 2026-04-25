import type { NormalizedEvent } from "../adapters/types";

export interface RunEvent extends Record<string, unknown> {
  matrixRunId: string;
  runId: string;
  event: NormalizedEvent;
}

type Subscriber = (ev: RunEvent) => void;

export class EventHub {
  private byMatrix = new Map<string, Set<Subscriber>>();

  subscribe(matrixRunId: string, cb: Subscriber): () => void {
    let set = this.byMatrix.get(matrixRunId);
    if (!set) {
      set = new Set();
      this.byMatrix.set(matrixRunId, set);
    }
    set.add(cb);
    return () => {
      set?.delete(cb);
      if (set && set.size === 0) this.byMatrix.delete(matrixRunId);
    };
  }

  publish(ev: RunEvent): void {
    const subs = this.byMatrix.get(ev.matrixRunId);
    if (!subs) return;
    for (const cb of subs) {
      try {
        cb(ev);
      } catch {
        // best-effort
      }
    }
  }
}
