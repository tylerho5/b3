export type BroadcastMode = "wait" | "immediate";

export interface BroadcastEvent {
  runId: string;
  t: "message_inject" | "segment_start" | "message_delivered";
  text?: string;
  kind?: "broadcast";
  ts: number;
}

type Inject = (text: string) => Promise<void>;

interface PendingBroadcast {
  text: string;
  pending: Set<string>;
}

export class BroadcastQueue {
  private sessions = new Map<string, Inject>();
  private pending: PendingBroadcast | null = null;
  private listeners: ((ev: BroadcastEvent) => void)[] = [];

  register(runId: string, inject: Inject): void {
    this.sessions.set(runId, inject);
  }

  unregister(runId: string): void {
    this.sessions.delete(runId);
    if (this.pending) {
      this.pending.pending.delete(runId);
      void this.maybeFlush();
    }
  }

  onEvent(cb: (ev: BroadcastEvent) => void): void {
    this.listeners.push(cb);
  }

  private emit(ev: BroadcastEvent): void {
    for (const cb of this.listeners) cb(ev);
  }

  async broadcast(input: { text: string; mode: BroadcastMode }): Promise<void> {
    if (input.mode === "immediate") {
      const targets = Array.from(this.sessions.entries());
      await Promise.all(
        targets.map(async ([runId, inject]) => {
          await inject(input.text);
          const ts = Date.now();
          this.emit({
            runId,
            t: "message_inject",
            text: input.text,
            ts,
          });
          this.emit({
            runId,
            t: "segment_start",
            kind: "broadcast",
            text: input.text,
            ts,
          });
        }),
      );
      return;
    }

    // wait mode: queue, deliver when all current sessions have hit segment_end
    if (this.pending) {
      throw new Error(
        "Another broadcast is already pending; only one wait-broadcast may be in flight",
      );
    }
    this.pending = {
      text: input.text,
      pending: new Set(this.sessions.keys()),
    };
  }

  async notifySegmentEnd(runId: string): Promise<void> {
    if (!this.pending) return;
    this.pending.pending.delete(runId);
    await this.maybeFlush();
  }

  private async maybeFlush(): Promise<void> {
    if (!this.pending) return;
    if (this.pending.pending.size > 0) return;
    const text = this.pending.text;
    this.pending = null;
    const targets = Array.from(this.sessions.entries());
    await Promise.all(
      targets.map(async ([runId, inject]) => {
        await inject(text);
        const ts = Date.now();
        this.emit({
          runId,
          t: "message_inject",
          text,
          ts,
        });
        this.emit({
          runId,
          t: "segment_start",
          kind: "broadcast",
          text,
          ts,
        });
      }),
    );
  }
}
