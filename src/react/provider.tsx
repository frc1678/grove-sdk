import {
  ConvexAuthProvider,
  useAuthActions,
  useAuthToken,
} from "@convex-dev/auth/react";
import {
  ConvexProviderWithAuth,
  ConvexReactClient,
  useConvexAuth,
  type Watch,
} from "convex/react";
import type { FunctionReference } from "convex/server";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { appSlugFromBase } from "../report/context";
import { ReportProvider } from "../report";
import { groveApi } from "./api";

// One provider gives an app both halves of the Grove contract:
//
//  - the Grove's Convex client, wrapped in ConvexAuthProvider, which owns the
//    sign-in session (tokens, refresh, sign-out) and answers live Grove
//    queries such as users.me and the roster;
//  - the app's own Convex client, wrapped in ConvexProviderWithAuth, which
//    is handed the Grove's JWT so the app deployment sees the same user.
//
// Served under /<slug> on the Grove's origin, the session storage is shared
// with the Grove sign-in page by construction; nothing here is origin-aware.

type SignIn = ReturnType<typeof useAuthActions>["signIn"];

export type GroveContextValue = {
  grove: ConvexReactClient;
  app: ConvexReactClient;
  appName: string;
  // Where to send someone who isn't signed in. Relative by default: the
  // Grove owns /sign-in on this origin and returns to `next` afterwards.
  signInPath: string;
  isLoading: boolean;
  isAuthenticated: boolean;
  token: string | null;
  signIn: SignIn;
  signOut: () => Promise<void>;
  /** @internal */
  tokenRef: { current: string | null };
  /** @internal */
  waitForNewToken: (previous: string | null, timeoutMs: number) => Promise<string | null>;
};

/** @internal Exported for tests; not re-exported from the package entry. */
export const GroveContext = createContext<GroveContextValue | null>(null);

export function useGrove(): GroveContextValue {
  const value = useContext(GroveContext);
  if (value === null) {
    throw new Error("useGrove must be used inside <GroveProvider>");
  }
  return value;
}

export type GroveProviderProps = {
  // The Grove deployment URL (VITE_GROVE_CONVEX_URL). Must be exactly the
  // string the Grove itself uses: Convex Auth namespaces its token storage
  // by it.
  groveUrl: string;
  // This app's own deployment URL (VITE_CONVEX_URL).
  appUrl: string;
  appName: string;
  signInPath?: string;
  // "V03.07", from the app's src/app-version.ts. Problem reports name the
  // build they were filed from with it, so pass it here even when the
  // header already shows it through GroveShell.
  version?: string;
  // The slug the app is registered under in Admin → Apps. Defaults to the
  // first segment of Vite's base ("/sim/" → "sim"), which every app already
  // sets so the Grove can serve it under /<slug>.
  appSlug?: string;
  children: ReactNode;
};

export function GroveProvider({
  groveUrl,
  appUrl,
  appName,
  signInPath = "/sign-in",
  version,
  appSlug = appSlugFromBase(import.meta.env.BASE_URL),
  children,
}: GroveProviderProps) {
  const clients = useMemo(
    () => ({
      grove: new ConvexReactClient(groveUrl),
      app: new ConvexReactClient(appUrl),
    }),
    [groveUrl, appUrl],
  );
  return (
    <ConvexAuthProvider client={clients.grove}>
      <GroveAuthCapture
        grove={clients.grove}
        app={clients.app}
        appName={appName}
        signInPath={signInPath}
      >
        <GroveReport app={appSlug} version={version}>
          {children}
        </GroveReport>
      </GroveAuthCapture>
    </ConvexAuthProvider>
  );
}

// Sits inside the Grove's auth provider (so it can read the session) and
// outside the app's provider (so it can feed it).
function GroveAuthCapture({
  grove,
  app,
  appName,
  signInPath,
  children,
}: {
  grove: ConvexReactClient;
  app: ConvexReactClient;
  appName: string;
  signInPath: string;
  children: ReactNode;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const token = useAuthToken();
  const { signIn, signOut } = useAuthActions();

  // Kept current during render, not in an effect: the app client (a child)
  // runs its effects before this component's, and must see the token the
  // moment isAuthenticated flips.
  const tokenRef = useRef<string | null>(token);
  tokenRef.current = token;
  const waiters = useRef<((token: string | null) => void)[]>([]);
  useEffect(() => {
    const pending = waiters.current;
    waiters.current = [];
    for (const resolve of pending) resolve(token);
  }, [token]);

  const waitForNewToken = useCallback(
    (previous: string | null, timeoutMs: number) =>
      new Promise<string | null>((resolve) => {
        if (tokenRef.current !== previous) {
          resolve(tokenRef.current);
          return;
        }
        const timer = setTimeout(() => {
          waiters.current = waiters.current.filter((waiter) => waiter !== onToken);
          resolve(tokenRef.current);
        }, timeoutMs);
        const onToken = (next: string | null) => {
          clearTimeout(timer);
          resolve(next);
        };
        waiters.current.push(onToken);
      }),
    [],
  );

  const value = useMemo<GroveContextValue>(
    () => ({
      grove,
      app,
      appName,
      signInPath,
      isLoading,
      isAuthenticated,
      token,
      signIn,
      signOut,
      tokenRef,
      waitForNewToken,
    }),
    [grove, app, appName, signInPath, isLoading, isAuthenticated, token, signIn, signOut, waitForNewToken],
  );

  return (
    <GroveContext.Provider value={value}>
      <ConvexProviderWithAuth client={app} useAuth={useGroveTokenBridge}>
        {children}
      </ConvexProviderWithAuth>
    </GroveContext.Provider>
  );
}

// What ConvexProviderWithAuth asks of an identity provider: loading state,
// signed-in state, and a way to get the current (or a fresh) token. The
// Grove's provider rotates the JWT before it expires, so "fresh" usually
// means "the one we already have"; when the app deployment rejects a token,
// wait briefly for the rotation to land.
/** @internal Exported for tests; not re-exported from the package entry. */
export function useGroveTokenBridge() {
  const { isLoading, isAuthenticated, tokenRef, waitForNewToken } = useGrove();
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      const current = tokenRef.current;
      if (!forceRefreshToken) return current;
      return await waitForNewToken(current, 8000);
    },
    // Deliberately stable across a token rotation, which is why `token` is not
    // a dependency. ConvexProviderWithAuth keeps this callback in an effect's
    // dependencies, so re-creating it tears that effect down, and the cleanup
    // reports the app client unauthenticated until the app deployment has
    // verified the new token — every page behind RequireSignedIn unmounts and
    // remounts in that window, losing its state. Nothing needs the rotation
    // pushed: tokenRef is kept current during render, and Convex's own client
    // schedules a forceRefreshToken refetch before the JWT expires, which
    // waitForNewToken answers with the rotated token. Sign-out and sign-in
    // still flip isAuthenticated, which re-runs Convex's effect as it should.
    [tokenRef, waitForNewToken],
  );
  return useMemo(
    () => ({ isLoading, isAuthenticated, fetchAccessToken }),
    [isLoading, isAuthenticated, fetchAccessToken],
  );
}

// Problem reports go to the Grove through its client, tagged with the
// signed-in account. users.me is the same query RequireSignedIn and
// GroveShell read, and the Convex client shares one subscription between
// identical watches, so this costs nothing on the wire.
function GroveReport({
  app,
  version,
  children,
}: {
  app: string;
  version?: string;
  children: ReactNode;
}) {
  const { grove, isAuthenticated } = useGrove();
  const me = useGroveQuery(groveApi.users.me, isAuthenticated ? {} : "skip");
  const id = me?._id;
  const role = me?.effectiveRole ?? me?.role;
  const user = useMemo(() => (id === undefined ? null : { id, role }), [id, role]);
  return (
    <ReportProvider client={grove} app={app} version={version} user={user}>
      {children}
    </ReportProvider>
  );
}

// Subscribe to a Grove (not app) query. Mirrors convex/react's useQuery but
// against the Grove client, which is not the one in React context here.
export function useGroveQuery<Args extends Record<string, unknown>, Ret>(
  query: FunctionReference<"query", "public", Args, Ret>,
  args: Args | "skip",
): Ret | undefined {
  const { grove } = useGrove();
  const [state, setState] = useState<{ value?: Ret; error?: Error }>({});
  const argsKey = args === "skip" ? "skip" : JSON.stringify(args);
  useEffect(() => {
    if (args === "skip") {
      setState({});
      return;
    }
    // The generic signature wants a tuple type the SDK can't name for an
    // arbitrary reference; the call is the same as convex/react's useQuery.
    const watch = (grove.watchQuery as (q: unknown, a: unknown) => Watch<Ret>)(query, args);
    const read = () => {
      try {
        setState({ value: watch.localQueryResult() });
      } catch (error) {
        setState({ error: error instanceof Error ? error : new Error(String(error)) });
      }
    };
    read();
    return watch.onUpdate(read);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grove, query, argsKey]);
  if (state.error !== undefined) {
    throw state.error;
  }
  return state.value;
}
