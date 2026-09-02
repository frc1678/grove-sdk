import { useState } from "react";
import { useGrove } from "./provider";

// Dev-only sign-in against the Grove deployment. In production the Grove's
// own /sign-in page is the only login on the origin; this exists because a
// Vite dev server on localhost can't read the Grove's session.
export function DevSignIn() {
  const { signIn, appName } = useGrove();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <form
        className="w-full max-w-sm rounded-xl border bg-card p-6 text-card-foreground shadow-sm"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          setError(null);
          const formData = new FormData(event.currentTarget);
          formData.set("flow", flow);
          try {
            await signIn("password", formData);
          } catch {
            setError(
              flow === "signIn"
                ? "Could not sign in. Check your email and password."
                : "Could not create the account.",
            );
            setSubmitting(false);
          }
        }}
      >
        <h1 className="text-lg font-semibold">{appName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dev sign-in with your Grove account. In production the Grove handles
          this.
        </p>
        <label className="mt-4 grid gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="rounded-md border bg-background px-3 py-2"
          />
        </label>
        <label className="mt-3 grid gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            autoComplete={flow === "signIn" ? "current-password" : "new-password"}
            required
            className="rounded-md border bg-background px-3 py-2"
          />
        </label>
        {error !== null && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-4 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {flow === "signIn" ? "Sign in" : "Sign up"}
        </button>
        <button
          type="button"
          className="mt-2 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
        >
          {flow === "signIn" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
