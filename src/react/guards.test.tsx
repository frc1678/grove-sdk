import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  app: { isLoading: false, isAuthenticated: true },
}));

vi.mock("convex/react", () => ({ useConvexAuth: () => state.app }));
vi.mock("./provider", () => ({
  useGrove: () => ({
    isLoading: false,
    isAuthenticated: true,
    signInPath: "/sign-in",
    appName: "Test",
    signOut: async () => {},
  }),
  useGroveQuery: () => ({ _id: "u1", _creationTime: 0, status: "active" }),
}));

const { AUTH_PROBLEM_DELAY_MS, RequireSignedIn } = await import("./guards");

let mounts = 0;

function Child() {
  useEffect(() => {
    mounts += 1;
  }, []);
  return <div>page content</div>;
}

function mount() {
  const view = render(
    <RequireSignedIn>
      <Child />
    </RequireSignedIn>,
  );
  return (next: { isLoading: boolean; isAuthenticated: boolean }) => {
    state.app = next;
    act(() => {
      view.rerender(
        <RequireSignedIn>
          <Child />
        </RequireSignedIn>,
      );
    });
  };
}

const authProblemShown = () => screen.queryByText(/could not verify your sign-in/i) !== null;
const childShown = () => screen.queryByText("page content") !== null;

beforeEach(() => {
  mounts = 0;
  state.app = { isLoading: false, isAuthenticated: true };
  vi.useFakeTimers();
});

afterEach(() => {
  // Auto-cleanup only registers itself when vitest runs with globals.
  cleanup();
  vi.useRealTimers();
});

describe("RequireSignedIn", () => {
  test("keeps children mounted through a token rotation", () => {
    const update = mount();
    expect(childShown()).toBe(true);
    expect(mounts).toBe(1);

    // The app client goes unauthenticated while it verifies the rotated JWT.
    update({ isLoading: false, isAuthenticated: false });
    expect(childShown()).toBe(true);
    expect(authProblemShown()).toBe(false);

    act(() => void vi.advanceTimersByTime(AUTH_PROBLEM_DELAY_MS - 100));
    expect(childShown()).toBe(true);

    update({ isLoading: false, isAuthenticated: true });
    act(() => void vi.advanceTimersByTime(AUTH_PROBLEM_DELAY_MS));
    expect(childShown()).toBe(true);
    expect(authProblemShown()).toBe(false);
    // Never remounted: long-running page state survives the rotation.
    expect(mounts).toBe(1);
  });

  test("shows the auth problem once the unauthenticated window persists", () => {
    const update = mount();
    update({ isLoading: false, isAuthenticated: false });

    act(() => void vi.advanceTimersByTime(AUTH_PROBLEM_DELAY_MS));
    expect(authProblemShown()).toBe(true);
    expect(childShown()).toBe(false);
  });

  test("an app client that was never authenticated fails immediately", () => {
    state.app = { isLoading: false, isAuthenticated: false };
    mount();

    expect(authProblemShown()).toBe(true);
    expect(childShown()).toBe(false);
    expect(mounts).toBe(0);
  });
});
