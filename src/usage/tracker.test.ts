import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createUsageTracker,
  setActiveTracker,
  trackGroveEvent,
  type UsageBatch,
} from "./tracker";

function harness(options: { fail?: boolean } = {}) {
  let path = "/chime/";
  let hidden: (() => void) | undefined;
  const store = new Map<string, string>();
  const sent: UsageBatch[] = [];
  const send = vi.fn(async (batch: UsageBatch) => {
    if (options.fail) throw new Error("Could not find public function for 'usage:record'");
    sent.push(batch);
  });
  const make = () =>
    createUsageTracker({
      app: "chime",
      send,
      now: () => Date.now(),
      path: () => path,
      storage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => void store.set(key, value) },
      onHidden: (callback) => {
        hidden = callback;
        return () => (hidden = undefined);
      },
    });
  return {
    tracker: make(),
    make,
    send,
    sent,
    go: (next: string) => (path = next),
    hide: () => hidden?.(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 20, 18));
});

afterEach(() => {
  vi.useRealTimers();
  setActiveTracker(null);
});

describe("the usage tracker", () => {
  test("records a page view on start and on each path change, then sends every 30 s", async () => {
    const h = harness();
    h.tracker.start();
    await vi.advanceTimersByTimeAsync(2_000);
    h.go("/chime/events/3");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].app).toBe("chime");
    expect(h.sent[0].sessionId).toMatch(/^[a-z0-9]{24}$/);
    expect(h.sent[0].events.map((event) => [event.name, event.path])).toEqual([
      ["page_view", "/chime/"],
      ["page_view", "/chime/events/3"],
    ]);

    // Nothing new: nothing sent.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.sent).toHaveLength(1);
    h.tracker.stop();
  });

  test("named events go in the next batch; a full batch goes at once; bad names are dropped", async () => {
    const h = harness();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.tracker.track("Mission Created");
    expect(warn).toHaveBeenCalled();
    for (let i = 0; i < 50; i++) h.tracker.track("mission.created");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].events).toHaveLength(50);
    expect(h.sent[0].events.every((event) => event.name === "mission.created")).toBe(true);
    warn.mockRestore();
  });

  test("hiding the page sends what is waiting; stop sends the rest", async () => {
    const h = harness();
    h.tracker.start();
    h.hide();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.sent).toHaveLength(1);
    h.tracker.track("form.submitted");
    h.tracker.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.sent.map((batch) => batch.events.length)).toEqual([1, 1]);
  });

  test("a failing Grove keeps the events, then is left alone after three tries", async () => {
    const h = harness({ fail: true });
    h.tracker.track("x");
    await h.tracker.flush();
    await h.tracker.flush();
    await h.tracker.flush();
    await h.tracker.flush();
    expect(h.send).toHaveBeenCalledTimes(3);
    expect(h.send.mock.calls[2][0].events).toHaveLength(1);
  });

  test("a session survives a reload and ends after half an hour of quiet", async () => {
    const h = harness();
    h.tracker.track("a");
    await h.tracker.flush();
    const reloaded = h.make();
    reloaded.track("b");
    await reloaded.flush();
    expect(h.sent[1].sessionId).toBe(h.sent[0].sessionId);

    vi.setSystemTime(Date.now() + 31 * 60 * 1000);
    reloaded.track("c");
    await reloaded.flush();
    expect(h.sent[2].sessionId).not.toBe(h.sent[0].sessionId);
  });

  test("trackGroveEvent goes to the running tracker, and is a no-op without one", async () => {
    trackGroveEvent("nobody.listening");
    const h = harness();
    setActiveTracker(h.tracker);
    trackGroveEvent("mission.created");
    await h.tracker.flush();
    expect(h.sent[0].events.map((event) => event.name)).toEqual(["mission.created"]);
  });
});
