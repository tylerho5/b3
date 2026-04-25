import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { RefinedTask } from "../types/shared";

export function RefinerModal({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (refined: RefinedTask) => void;
}) {
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<{
    message: string;
    raw?: string | null;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) {
      setDraft("");
      setStatus("idle");
      setError(null);
      setElapsed(0);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (!open) return null;

  const submit = async () => {
    if (!draft.trim()) return;
    setStatus("running");
    setError(null);
    setElapsed(0);
    const t0 = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 250);
    abortRef.current = new AbortController();
    try {
      const refined = await api.refineTask(draft, abortRef.current.signal);
      onApply(refined);
      onClose();
    } catch (e) {
      const err = e as Error & { raw?: string };
      setError({ message: err.message, raw: err.raw });
      setStatus("error");
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    if (timerRef.current) clearInterval(timerRef.current);
    setStatus("idle");
    onClose();
  };

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-content">
        <div className="modal-header">refine task with claude code</div>
        <div className="modal-body">
          <p
            style={{
              marginTop: 0,
              fontSize: 12,
              color: "var(--text-secondary)",
            }}
          >
            describe what this task should test (a sentence or three is enough):
          </p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="agent should fix an off-by-one in a python pagination function"
          />
          {error && (
            <div className="refiner-error">
              <div>{error.message}</div>
              {error.raw && <pre>{error.raw}</pre>}
            </div>
          )}
        </div>
        <div className="modal-footer">
          {status === "running" && (
            <span className="modal-status">
              <span className="dot running"></span>
              running… {elapsed}s
            </span>
          )}
          {status === "error" && (
            <span className="modal-status">
              <span className="dot error"></span>
              failed
            </span>
          )}
          <button
            type="button"
            className="secondary"
            onClick={cancel}
            disabled={status === "running" && !abortRef.current}
          >
            cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={submit}
            disabled={status === "running" || !draft.trim()}
          >
            refine
          </button>
        </div>
      </div>
    </div>
  );
}
