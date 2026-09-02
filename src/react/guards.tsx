import { useEffect, type ReactNode } from "react";
import { groveApi, type Me } from "./api";
import { DevSignIn } from "./DevSignIn";
import { useGrove, useGroveQuery } from "./provider";

// The signed-in Grove account (users.me), or null when signed out.
export function useMe(): Me | null | undefined {
  const { isAuthenticated } = useGrove();
  return useGroveQuery(groveApi.users.me, isAuthenticated ? {} : "skip");
}

export function groveSignInUrl(signInPath: string, next?: string): string {
  const target =
    next ?? `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `${signInPath}?next=${encodeURIComponent(target)}`;
}

// Gate for everything behind sign-in. Signed-out visitors go to the Grove's
// sign-in page (same origin in production) and come back afterwards. In
// dev, where the app runs on its own localhost origin and can't share the
// Grove's session, a local sign-in form talks to the Grove deployment
// directly. Pending and archived accounts see a holding page instead of
// throwing on every query.
export function RequireSignedIn({
  children,
  loading,
  pending,
}: {
  children: ReactNode;
  loading?: ReactNode;
  pending?: (status: "pending" | "archived") => ReactNode;
}) {
  const { isLoading, isAuthenticated, signInPath } = useGrove();
  const me = useMe();
  const isDev = import.meta.env.DEV;

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isDev) {
      window.location.replace(groveSignInUrl(signInPath));
    }
  }, [isLoading, isAuthenticated, isDev, signInPath]);

  if (isLoading || (isAuthenticated && me === undefined)) {
    return <>{loading ?? <Spinner />}</>;
  }
  if (!isAuthenticated) {
    return isDev ? <DevSignIn /> : <>{loading ?? <Spinner />}</>;
  }
  if (me?.status === "pending" || me?.status === "archived") {
    return <>{pending ? pending(me.status) : <PendingScreen status={me.status} />}</>;
  }
  return <>{children}</>;
}

export function Spinner() {
  return (
    <div className="flex min-h-svh items-center justify-center text-muted-foreground">
      <span
        className="size-6 animate-spin rounded-full border-2 border-current border-t-transparent"
        aria-label="Loading"
      />
    </div>
  );
}

export function PendingScreen({ status }: { status: "pending" | "archived" }) {
  const { signOut } = useGrove();
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center text-card-foreground shadow-sm">
        <h1 className="text-lg font-semibold">
          {status === "pending" ? "Account pending approval" : "Account archived"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {status === "pending"
            ? "A lead or coach will approve your account on the Grove. Check back soon."
            : "This account is no longer active. Ask a coach if that's a mistake."}
        </p>
        <button
          type="button"
          className="mt-4 text-sm underline underline-offset-4"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
