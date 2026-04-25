import { test, expect } from "bun:test";
import { BroadcastQueue } from "../src/orchestrator/broadcast";

interface FakeSession {
  runId: string;
  delivered: string[];
}

function fakeAdapter(s: FakeSession) {
  return {
    inject: async (text: string) => {
      s.delivered.push(text);
    },
  };
}

test("wait mode: not delivered until all sessions reach segment_end", async () => {
  const sA: FakeSession = { runId: "a", delivered: [] };
  const sB: FakeSession = { runId: "b", delivered: [] };
  const queue = new BroadcastQueue();
  queue.register("a", fakeAdapter(sA).inject);
  queue.register("b", fakeAdapter(sB).inject);

  const events: string[] = [];
  queue.onEvent((ev) => events.push(`${ev.runId}:${ev.t}`));

  queue.broadcast({ text: "ping all", mode: "wait" });
  expect(sA.delivered).toEqual([]);
  expect(sB.delivered).toEqual([]);

  await queue.notifySegmentEnd("a");
  expect(sA.delivered).toEqual([]);
  expect(sB.delivered).toEqual([]);

  await queue.notifySegmentEnd("b");
  expect(sA.delivered).toEqual(["ping all"]);
  expect(sB.delivered).toEqual(["ping all"]);
  expect(events).toContain("a:message_inject");
  expect(events).toContain("b:message_inject");
});

test("immediate mode: delivered to each session right away", async () => {
  const sA: FakeSession = { runId: "a", delivered: [] };
  const sB: FakeSession = { runId: "b", delivered: [] };
  const queue = new BroadcastQueue();
  queue.register("a", fakeAdapter(sA).inject);
  queue.register("b", fakeAdapter(sB).inject);

  await queue.broadcast({ text: "hi", mode: "immediate" });
  expect(sA.delivered).toEqual(["hi"]);
  expect(sB.delivered).toEqual(["hi"]);
});

test("emits segment_start kind=broadcast after wait-delivery", async () => {
  const sA: FakeSession = { runId: "a", delivered: [] };
  const queue = new BroadcastQueue();
  queue.register("a", fakeAdapter(sA).inject);
  const events: { runId: string; t: string; kind?: string }[] = [];
  queue.onEvent((ev) => events.push(ev as never));

  queue.broadcast({ text: "go", mode: "wait" });
  await queue.notifySegmentEnd("a");

  const starts = events.filter((e) => e.t === "segment_start");
  expect(starts.length).toBe(1);
  expect(starts[0].kind).toBe("broadcast");
});

test("late session join after broadcast does not retroactively receive it", async () => {
  const sA: FakeSession = { runId: "a", delivered: [] };
  const queue = new BroadcastQueue();
  queue.register("a", fakeAdapter(sA).inject);

  queue.broadcast({ text: "1", mode: "wait" });
  await queue.notifySegmentEnd("a");
  expect(sA.delivered).toEqual(["1"]);

  // a new session joining later should not auto-receive prior broadcasts
  const sB: FakeSession = { runId: "b", delivered: [] };
  queue.register("b", fakeAdapter(sB).inject);
  await queue.notifySegmentEnd("b");
  expect(sB.delivered).toEqual([]);
});

test("unregister removes session from broadcast targets", async () => {
  const sA: FakeSession = { runId: "a", delivered: [] };
  const sB: FakeSession = { runId: "b", delivered: [] };
  const queue = new BroadcastQueue();
  queue.register("a", fakeAdapter(sA).inject);
  queue.register("b", fakeAdapter(sB).inject);

  queue.unregister("b");
  await queue.broadcast({ text: "x", mode: "immediate" });
  expect(sA.delivered).toEqual(["x"]);
  expect(sB.delivered).toEqual([]);
});
