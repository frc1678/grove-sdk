import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Sandbox } from "../sandbox";
import { TutorialRunner } from "./TutorialRunner";
import { defineTutorials, tutorialsFor, untilMet, type Tutorial } from "./types";

const catalog = [
  { id: "add", title: "Add a task", summary: "Make one.", points: 10, minutes: 2 },
  { id: "manage", title: "Close the season", summary: "Leads only.", points: 20, minRole: "lead" },
] as const;
// A const catalog naming groups must still type-check through defineTutorials.
defineTutorials(
  [{ id: "grouped", title: "Grouped", summary: "s", points: 5, minRole: "lead", groups: ["Outreach Leads"] }] as const,
  { grouped: { steps: [{ title: "t", body: "b" }] } },
);

const tutorials: Tutorial[] = defineTutorials(catalog, {
  add: {
    effects: [{ name: "tasks:create", run: () => "practice-task-1" }],
    steps: [
      { title: "Open the form", body: "Press New.", route: "/tasks", until: { click: "[data-tour=new]" } },
      { title: "Save it", body: "Press Save.", until: { did: "tasks:create" } },
      { title: "That's it", body: "It is in the list." },
    ],
  },
  manage: { steps: [{ title: "Only for leads", body: "…" }] },
});

let opener: (() => void) | null = null;
let badge: string | undefined;
const navigate = vi.fn();
const onComplete = vi.fn();

function mount(sandbox: Sandbox, completed = new Set<string>(), role: "student" | "lead" = "student") {
  // StrictMode, as every app runs in development: it runs each effect's
  // cleanup once on mount, which is how a sandbox once closed itself under
  // a frame that said nothing was being saved.
  return render(
    <StrictMode>
      <button data-tour="new">New</button>
      <TutorialRunner
        sandbox={sandbox}
        appName="Tasks"
        tutorials={tutorials}
        role={role}
        completed={completed}
        onComplete={onComplete}
        pathname="/"
        navigate={navigate}
        register={(open, count) => {
          opener = open;
          badge = count;
        }}
      />
    </StrictMode>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom implements neither.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  navigate.mockReset();
  onComplete.mockReset();
  window.history.replaceState(null, "", "/");
});

// The layer is a popover, which jsdom leaves out of the accessibility tree.
const button = (name: string) => screen.getByRole("button", { name, hidden: true });
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("TutorialRunner", () => {
  test("offers only what the role may see", () => {
    expect(tutorialsFor(tutorials, "student").map((t) => t.id)).toEqual(["add"]);
    expect(tutorialsFor(tutorials, "coach").map((t) => t.id)).toEqual(["add", "manage"]);
    // A tutorial a group may take is left to the app's own filter.
    expect(tutorialsFor([{ id: "g", minRole: "lead" as const, groups: ["Outreach Leads"] }], "student")).toHaveLength(1);
    mount(new Sandbox());
    expect(badge).toBe("0/1");
    act(() => opener?.());
    expect(screen.queryByText("Close the season")).toBeNull();
    expect(screen.getByText("Add a task")).toBeTruthy();
  });

  test("runs a tutorial through the sandbox and records it once finished", () => {
    const sandbox = new Sandbox();
    mount(sandbox);
    act(() => opener?.());
    fireEvent.click(button("Start"));
    expect(sandbox.active).toBe(true);
    expect(document.documentElement.classList.contains("grove-tutorial-mode")).toBe(true);
    expect(screen.getByText("You're in tutorial mode")).toBeTruthy();

    fireEvent.click(button("Start"));
    expect(screen.getByText("Open the form")).toBeTruthy();
    expect(navigate).toHaveBeenCalledWith("/tasks");

    // Step one waits for the click; step two for the practised write.
    fireEvent.click(screen.getByText("New"));
    tick(700);
    expect(screen.getByText("Save it")).toBeTruthy();
    act(() => void sandbox.write("mutation", "tasks:create", { title: "x" }));
    tick(700);
    expect(screen.getByText("That's it")).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(button("Finish"));
    tick(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].id).toBe("add");
    expect(screen.getByText("+10 points")).toBeTruthy();
    // Still practising until they leave.
    expect(sandbox.active).toBe(true);
    fireEvent.click(button("Done"));
    expect(sandbox.active).toBe(false);
    expect(document.documentElement.classList.contains("grove-tutorial-mode")).toBe(false);
  });

  test("says so when a write was skipped, and exits from the strip", () => {
    const sandbox = new Sandbox();
    mount(sandbox);
    act(() => opener?.());
    fireEvent.click(button("Start"));
    fireEvent.pointerDown(document.body);
    act(() => void sandbox.write("mutation", "settings:wipe", {}));
    expect(screen.getByText(/so it was skipped/)).toBeTruthy();
    fireEvent.click(button("Exit tutorial"));
    expect(sandbox.active).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("the frame is never up over a closed sandbox", () => {
    const sandbox = new Sandbox();
    const view = mount(sandbox);
    act(() => opener?.());
    fireEvent.click(button("Start"));
    const framed = () => document.documentElement.classList.contains("grove-tutorial-mode");
    expect(framed() && sandbox.active).toBe(true);
    view.unmount();
    expect(sandbox.active).toBe(false);
    expect(framed()).toBe(false);
  });

  test("`at` can wait on the query string as well as the path", () => {
    expect(untilMet({ at: "/runs?group=battery" }, "/runs", document, "?group=battery&sort=date")).toBe(true);
    expect(untilMet({ at: "/runs?group=battery" }, "/runs", document, "?group=date")).toBe(false);
    expect(untilMet({ at: (_path, search) => search.includes("sort=") }, "/runs", document, "?sort=x")).toBe(true);
    expect(untilMet({ at: "/runs" }, "/runs", document, "?anything")).toBe(true);
  });

  test("points are promised only once the Grove has recorded them", async () => {
    onComplete.mockReturnValue(Promise.resolve(false));
    const sandbox = new Sandbox();
    mount(sandbox);
    act(() => opener?.());
    fireEvent.click(button("Start"));
    fireEvent.click(button("Start"));
    fireEvent.click(button("Skip this step"));
    fireEvent.click(button("Skip this step"));
    fireEvent.click(button("Finish"));
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(screen.queryByText("+10 points")).toBeNull();
    expect(screen.getByText(/could not be recorded/)).toBeTruthy();
  });

  test("a finished tutorial earns nothing twice, and ?tutorial= starts one", () => {
    window.history.replaceState(null, "", "/?tutorial=add&keep=1");
    const sandbox = new Sandbox();
    mount(sandbox, new Set(["add"]));
    expect(sandbox.active).toBe(true);
    expect(document.documentElement.classList.contains("grove-tutorial-mode")).toBe(true);
    expect(window.location.search).toBe("?keep=1");
    fireEvent.click(button("Start"));
    fireEvent.click(button("Skip this step"));
    fireEvent.click(button("Skip this step"));
    fireEvent.click(button("Finish"));
    tick(1);
    expect(screen.getByText(/You already have the 10 points/)).toBeTruthy();
  });
});
