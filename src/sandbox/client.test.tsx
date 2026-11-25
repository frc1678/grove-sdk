import { anyApi } from "convex/server";
import { afterEach, describe, expect, test } from "vitest";
import { SandboxConvexClient } from "./client";

// A socket that records what the client tries to send and never connects.
const sent: string[] = [];
class FakeSocket {
  static readonly OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }
  send(message: string) {
    sent.push(message);
  }
  close() {}
}

function client() {
  return new SandboxConvexClient("https://example.convex.cloud", {
    webSocketConstructor: FakeSocket as unknown as typeof WebSocket,
    unsavedChangesWarning: false,
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const mutations = () => sent.filter((message) => message.includes('"type":"Mutation"'));

afterEach(() => {
  sent.length = 0;
});

describe("SandboxConvexClient", () => {
  test("in tutorial mode a mutation never reaches the socket", async () => {
    const convex = client();
    convex.sandbox.enter({
      effects: [{ name: "tasks:create", run: () => "practice-task-1" }],
    });
    await expect(convex.mutation(anyApi.tasks.create, { title: "x" })).resolves.toBe("practice-task-1");
    await expect(convex.mutation(anyApi.tasks.wipe, {})).resolves.toBeNull();
    await expect(convex.action(anyApi.email.send, {})).resolves.toBeNull();
    await settle();
    expect(sent.filter((message) => /"type":"(Mutation|Action)"/.test(message))).toEqual([]);
    await convex.close();
  });

  test("out of tutorial mode a mutation is sent as usual", async () => {
    const convex = client();
    void convex.mutation(anyApi.tasks.create, { title: "x" });
    await settle();
    expect(mutations()).toHaveLength(1);
    // Not awaited: close waits for the mutation, and nothing will answer it.
    void convex.close();
  });

  test("a watched query shows the layer, re-reads when it changes, and keeps its identity between changes", async () => {
    const convex = client();
    const watch = convex.watchQuery(anyApi.tasks.get, { id: "practice-task-1" });
    let updates = 0;
    convex.sandbox.enter({
      setup: (box) => box.answer(anyApi.tasks.get, () => ({ _id: "practice-task-1", tags: ["a"] })),
    });
    const off = watch.onUpdate(() => {
      updates += 1;
    });
    // box.readAll and box.find see what the page watches, and stop seeing it
    // once the page lets go.
    expect(convex.sandbox.watching("tasks:get")).toEqual([{ id: "practice-task-1" }]);
    const first = watch.localQueryResult();
    expect(first).toEqual({ _id: "practice-task-1", tags: ["a"] });
    convex.sandbox.enter({
      setup: (box) => {
        box.answer(anyApi.tasks.get, () => ({ _id: "practice-task-1", tags: ["a"] }));
        box.edit(anyApi.tasks.get, (task: { tags: string[] }) => ({ ...task, tags: [...task.tags, "b"] }));
      },
    });
    expect(updates).toBe(1);
    const second = watch.localQueryResult() as { tags: string[] };
    expect(second.tags).toEqual(["a", "b"]);
    // An edit builds a new object each time it runs; the watch must not.
    expect(watch.localQueryResult()).toBe(second);
    off();
    expect(convex.sandbox.watching("tasks:get")).toEqual([]);
    await settle();
    // A practice document's query was never subscribed to on the server.
    expect(sent.filter((message) => message.includes("practice-task-1"))).toEqual([]);
    await convex.close();
  });
});
