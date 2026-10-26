import { render } from "@testing-library/react";
import { ConvexReactClient } from "convex/react";
import { describe, expect, test, vi } from "vitest";
import { CLIENT_OPTIONS, GroveContext, useGroveTokenBridge, type GroveContextValue } from "./provider";

// ConvexProviderWithAuth holds fetchAccessToken in an effect's dependencies.
// If it changes identity when the Grove rotates its JWT, the effect's cleanup
// reports the app client unauthenticated until the new token is verified, and
// every page behind RequireSignedIn unmounts. It must stay stable.

type Auth = ReturnType<typeof useGroveTokenBridge>;

function harness() {
  const tokenRef: { current: string | null } = { current: "token-1" };
  const seen: Auth[] = [];
  const waitForNewToken = async () => tokenRef.current;

  const value = (token: string | null): GroveContextValue =>
    ({
      grove: {},
      app: {},
      appName: "Test",
      signInPath: "/sign-in",
      isLoading: false,
      isAuthenticated: true,
      token,
      signIn: async () => ({ signingIn: false }),
      signOut: async () => {},
      tokenRef,
      waitForNewToken,
    }) as unknown as GroveContextValue;

  function Probe() {
    seen.push(useGroveTokenBridge());
    return null;
  }

  const { rerender } = render(
    <GroveContext.Provider value={value("token-1")}>
      <Probe />
    </GroveContext.Provider>,
  );

  return {
    seen,
    rotate(token: string) {
      tokenRef.current = token;
      rerender(
        <GroveContext.Provider value={value(token)}>
          <Probe />
        </GroveContext.Provider>,
      );
    },
  };
}

describe("useGroveTokenBridge", () => {
  test("keeps fetchAccessToken's identity when the token rotates", () => {
    const { seen, rotate } = harness();
    rotate("token-2");
    rotate("token-3");

    expect(seen.length).toBeGreaterThan(1);
    for (const auth of seen) {
      expect(auth.fetchAccessToken).toBe(seen[0]!.fetchAccessToken);
      // The whole auth object too: it is what ConvexProviderWithAuth reads.
      expect(auth).toBe(seen[0]!);
    }
  });

  test("still returns the newest token after a rotation", async () => {
    const { seen, rotate } = harness();
    const fetchAccessToken = seen[0]!.fetchAccessToken;
    expect(await fetchAccessToken({ forceRefreshToken: false })).toBe("token-1");

    rotate("token-2");
    expect(await fetchAccessToken({ forceRefreshToken: false })).toBe("token-2");
    expect(await fetchAccessToken({ forceRefreshToken: true })).toBe("token-2");
  });
});

describe("CLIENT_OPTIONS", () => {
  // The option is spelled the way the installed Convex reads it: a client
  // built with it registers no "Leave site?" handler at all. Without it,
  // the first use of the client adds one.
  test("leaves no beforeunload handler on the page", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const client = new ConvexReactClient("https://example-test-123.convex.cloud", CLIENT_OPTIONS);
    // The connection, and the handler with it, is made on first use.
    client.connectionState();
    expect(add.mock.calls.map(([type]) => type)).not.toContain("beforeunload");
    add.mockRestore();
    await client.close();
  });
});
