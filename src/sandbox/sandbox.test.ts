import { describe, expect, test, vi } from "vitest";
import { mentionsPractice, Sandbox, type SandboxEvent } from "./sandbox";

const tasks = [
  { _id: "a", title: "Real one", done: false },
  { _id: "b", title: "Real two", done: false },
];

function open(sandbox: Sandbox) {
  sandbox.enter({
    effects: [
      {
        name: "tasks:create",
        run: (args, box) => {
          const task = box.doc("task", { title: args.title, done: false });
          box.insert("tasks:list", task);
          box.answer("tasks:get", (query) => (query.id === task._id ? task : undefined));
          return task._id;
        },
      },
      { name: "tasks:finish", run: (args, box) => box.patch("tasks:list", args.id, { done: true }) },
      { name: "tasks:remove", run: (args, box) => box.remove("tasks:list", args.id) },
    ],
    allow: ["lookup:fetch"],
  });
}

describe("Sandbox", () => {
  test("closed, it is out of the way", () => {
    const sandbox = new Sandbox();
    expect(sandbox.write("mutation", "tasks:create", { title: "x" })).toEqual({ handled: false });
    expect(sandbox.view("tasks:list", {}, () => tasks)).toBe(tasks);
  });

  test("a practised write changes what the query shows and never asks to be sent", () => {
    const sandbox = new Sandbox();
    open(sandbox);
    const result = sandbox.write("mutation", "tasks:create", { title: "Mine" });
    expect(result.handled).toBe(true);
    const id = (result as { value: string }).value;
    expect(mentionsPractice(id)).toBe(true);
    const shown = sandbox.view("tasks:list", {}, () => tasks) as typeof tasks;
    expect(shown.map((task) => task.title)).toEqual(["Mine", "Real one", "Real two"]);
    // The server's own result is not touched.
    expect(tasks).toHaveLength(2);
  });

  test("edits real documents, and keeps applying as the server's result changes", () => {
    const sandbox = new Sandbox();
    open(sandbox);
    sandbox.write("mutation", "tasks:finish", { id: "a" });
    sandbox.write("mutation", "tasks:remove", { id: "b" });
    expect(sandbox.view("tasks:list", {}, () => tasks)).toEqual([
      { _id: "a", title: "Real one", done: true },
    ]);
    const later = [...tasks, { _id: "c", title: "Someone else's", done: false }];
    expect((sandbox.view("tasks:list", {}, () => later) as typeof tasks).map((t) => t._id)).toEqual([
      "a",
      "c",
    ]);
  });

  test("patches a page, and a query that returns the one document", () => {
    const sandbox = new Sandbox();
    open(sandbox);
    sandbox.write("mutation", "tasks:finish", { id: "a" });
    const page = { page: tasks, isDone: true, continueCursor: "" };
    expect((sandbox.view("tasks:list", {}, () => page) as typeof page).page[0].done).toBe(true);
    sandbox.enter({
      effects: [{ name: "tasks:finish", run: (args, box) => box.patch("tasks:get", args.id, { done: true }) }],
    });
    sandbox.write("mutation", "tasks:finish", { id: "a" });
    expect(sandbox.view("tasks:get", { id: "a" }, () => tasks[0])).toEqual({ ...tasks[0], done: true });
  });

  test("a query about a practice document is answered here and never read from the server", () => {
    const sandbox = new Sandbox();
    open(sandbox);
    const { value: id } = sandbox.write("mutation", "tasks:create", { title: "Mine" }) as {
      value: string;
    };
    const base = vi.fn(() => {
      throw new Error("the server would reject this id");
    });
    expect(sandbox.isLocal({ id })).toBe(true);
    expect(sandbox.view("tasks:get", { id }, base)).toMatchObject({ title: "Mine" });
    // No answer for this one: it stays loading rather than erroring.
    expect(sandbox.view("comments:forTask", { id }, base)).toBeUndefined();
    expect(base).not.toHaveBeenCalled();
  });

  test("a write the tutorial does not practise is dropped and reported", () => {
    const sandbox = new Sandbox();
    open(sandbox);
    const events: SandboxEvent[] = [];
    sandbox.onEvent((event) => events.push(event));
    expect(sandbox.write("mutation", "settings:wipe", {})).toEqual({ handled: true, value: null });
    expect(sandbox.write("action", "email:send", {})).toEqual({ handled: true, value: null });
    sandbox.write("mutation", "tasks:finish", { id: "a" });
    expect(events.map((event) => `${event.kind} ${event.name}`)).toEqual([
      "blocked settings:wipe",
      "blocked email:send",
      "practiced tasks:finish",
    ]);
  });

  test("allowed and passthrough functions are sent as usual", () => {
    const sandbox = new Sandbox({ passthrough: (name) => name.startsWith("auth:") });
    open(sandbox);
    expect(sandbox.write("action", "lookup:fetch", {})).toEqual({ handled: false });
    expect(sandbox.write("action", "auth:signIn", {})).toEqual({ handled: false });
  });

  test("leaving throws the layer away and tells every watcher", () => {
    const sandbox = new Sandbox();
    const changed = vi.fn();
    sandbox.subscribe(changed);
    open(sandbox);
    sandbox.write("mutation", "tasks:remove", { id: "a" });
    expect(sandbox.madePracticeDocs).toBe(false);
    sandbox.exit();
    expect(changed).toHaveBeenCalledTimes(3);
    expect(sandbox.view("tasks:list", {}, () => tasks)).toBe(tasks);
    expect(sandbox.write("mutation", "tasks:remove", { id: "a" })).toEqual({ handled: false });
  });

  test("an effect can read what a watched query shows, layer included", () => {
    const sandbox = new Sandbox({ reader: (name) => (name === "tasks:list" ? tasks : undefined) });
    let seen: unknown;
    sandbox.enter({
      effects: [
        { name: "tasks:remove", run: (args, box) => box.remove("tasks:list", args.id) },
        { name: "tasks:count", run: (_args, box) => void (seen = box.read("tasks:list")) },
      ],
    });
    sandbox.write("mutation", "tasks:remove", { id: "a" });
    sandbox.write("mutation", "tasks:count", {});
    expect(seen).toEqual([tasks[1]]);
  });

  test("an edit that throws leaves the real result on screen", () => {
    const sandbox = new Sandbox();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    sandbox.enter({
      setup: (box) =>
        box.edit("tasks:list", () => {
          throw new Error("unexpected shape");
        }),
    });
    expect(sandbox.view("tasks:list", {}, () => tasks)).toBe(tasks);
    warn.mockRestore();
  });

  test("a result still loading stays loading; the edit applies when it arrives", () => {
    const sandbox = new Sandbox();
    open(sandbox);
    sandbox.write("mutation", "tasks:remove", { id: "a" });
    expect(sandbox.view("tasks:list", {}, () => undefined)).toBeUndefined();
    expect(sandbox.view("tasks:list", {}, () => tasks)).toHaveLength(1);
  });
});
