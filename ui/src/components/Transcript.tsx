import type { RunSegment } from "../types/shared";

interface StoredEvent {
  id: number;
  type: string;
  tsMs: number;
  payload: unknown;
}

export function Transcript({
  segments,
  events,
  taskPrompt,
}: {
  segments: RunSegment[];
  events: StoredEvent[];
  taskPrompt: string;
}) {
  const bySeg = new Map<number, StoredEvent[]>();
  for (const e of events) {
    const seg = (e.payload as { segmentSeq?: number })?.segmentSeq ?? 0;
    void seg;
  }
  // Group events by their stored segment_seq column. Since we receive that on
  // the server side via segment_seq but the payload doesn't carry it, we
  // approximate from segment_start/segment_end pairs in time order.
  let cur = 0;
  for (const e of events) {
    if (e.type === "segment_start") {
      const p = e.payload as { seq?: number };
      cur = p.seq ?? cur;
    }
    const arr = bySeg.get(cur) ?? [];
    arr.push(e);
    bySeg.set(cur, arr);
    if (e.type === "segment_end") {
      cur = (cur ?? 0) + 1;
    }
  }

  return (
    <div className="run-detail-section">
      <h3>transcript</h3>
      {segments.length === 0 && events.length === 0 && (
        <div className="placeholder">no events</div>
      )}
      {segments.map((s) => {
        const segEvents = bySeg.get(s.seq) ?? [];
        const initialMessage = s.kind === "initial" ? taskPrompt : s.message;
        return (
          <div
            key={s.id}
            className={`transcript-segment kind-${s.kind}`}
          >
            <div className="seg-head">
              segment {s.seq} · {s.kind}{" "}
              {s.durationMs != null && `· ${(s.durationMs / 1000).toFixed(1)}s`}
            </div>
            {initialMessage && (
              <div className="transcript-event user">
                <span className="role">user:</span>
                {initialMessage}
              </div>
            )}
            {segEvents.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function EventRow({ event }: { event: StoredEvent }) {
  const p = event.payload as Record<string, unknown> & {
    t?: string;
  };
  const t = (p.t as string) ?? event.type;
  if (t === "assistant_text") {
    return (
      <div className="transcript-event">
        <span className="role">assistant:</span>
        {String(p.textDelta ?? "")}
      </div>
    );
  }
  if (t === "tool_call") {
    return (
      <div className="transcript-event tool">
        <span className="role">tool:</span>
        {String(p.toolName ?? "")}({String(p.argsPreview ?? "")})
      </div>
    );
  }
  if (t === "tool_result") {
    return (
      <div className="transcript-event tool">
        <span className="role">→</span>
        {p.ok ? "ok" : "error"}
        {p.durationMs ? ` · ${p.durationMs}ms` : ""}
      </div>
    );
  }
  if (t === "skill_invoked") {
    return (
      <div className="transcript-event tool">
        <span className="role">skill:</span>
        {String(p.skillName ?? "")}
      </div>
    );
  }
  if (t === "message_inject") {
    return (
      <div className="transcript-event user">
        <span className="role">
          user{p.mode === "broadcast" ? " (broadcast)" : ""}:
        </span>
        {String(p.text ?? "")}
      </div>
    );
  }
  if (t === "error") {
    return (
      <div className="transcript-event tool" style={{ color: "var(--error)" }}>
        <span className="role">error:</span>
        {String(p.message ?? "")}
      </div>
    );
  }
  return null;
}
