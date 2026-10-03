import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  seen: null as number | null | undefined,
  recorded: [] as number[],
}));

vi.mock("convex/react", () => ({
  useQuery: () => state.seen,
  useMutation: () => async (args: { version: number }) => {
    state.recorded.push(args.version);
    return null;
  },
}));
vi.mock("./provider", () => ({ useGrove: () => ({ appName: "Chime" }) }));
vi.mock("./guards", () => ({ useMe: () => ({ status: "active" }) }));

const { GroveTutorial } = await import("./GroveTutorial");

const seenVersion = "tutorial:seenVersion" as unknown as FunctionReference<
  "query",
  "public",
  Record<string, never>,
  number | null
>;
const markSeen = "tutorial:markSeen" as unknown as FunctionReference<
  "mutation",
  "public",
  { version: number },
  null
>;

const slides = [
  { title: "Welcome to Chime", body: "first slide" },
  { title: "RSVP in one tap", body: "second slide" },
];
const changelog = [
  { version: 2, changes: ["RSVPs from the calendar view"] },
  { version: 3, title: "Make-ups", changes: ["Make up a missed meeting"] },
];

// jsdom has <dialog> but not its modal API.
beforeEach(() => {
  state.seen = null;
  state.recorded = [];
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(cleanup);

function mount(seen: number | null) {
  state.seen = seen;
  render(
    <GroveTutorial
      version={3}
      slides={slides}
      changelog={changelog}
      seenVersion={seenVersion}
      markSeen={markSeen}
    />,
  );
  return screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;
}

describe("GroveTutorial", () => {
  test("a first visit opens the tutorial", () => {
    const dialog = mount(null);
    expect(dialog.open).toBe(true);
    expect(screen.getByRole("heading", { hidden: true, level: 2 }).textContent).toBe(
      "Welcome to Chime",
    );
  });

  test("a returning visitor after a bump sees what changed since their version, not the tutorial", () => {
    const dialog = mount(1);
    expect(dialog.open).toBe(true);
    expect(screen.getByRole("heading", { hidden: true, level: 2 }).textContent).toBe("What's new");
    expect(screen.getByText("Chime · V03")).toBeDefined();
    expect(screen.getByText("Make up a missed meeting")).toBeDefined();
    expect(screen.getByText("RSVPs from the calendar view")).toBeDefined();
    expect(screen.queryByText("first slide")).toBeNull();
  });

  test("only the versions they missed", () => {
    mount(2);
    expect(screen.getByText("Make up a missed meeting")).toBeDefined();
    expect(screen.queryByText("RSVPs from the calendar view")).toBeNull();
  });

  test("Got it records the current version, so it is shown once", async () => {
    const dialog = mount(1);
    await act(async () => fireEvent.click(screen.getByText("Got it")));
    expect(state.recorded).toEqual([3]);
    expect(dialog.open).toBe(false);
  });

  test("the tutorial is still one tap away from the changelog", () => {
    mount(1);
    fireEvent.click(screen.getByText("See the tutorial"));
    expect(screen.getByRole("heading", { hidden: true, level: 2 }).textContent).toBe(
      "Welcome to Chime",
    );
  });

  test("someone already on this version sees nothing", () => {
    expect(mount(3).open).toBe(false);
  });
});
