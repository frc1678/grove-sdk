import { useCallback, useMemo, useState, type ReactNode } from "react";
import { GroveIcon } from "./GroveIcon";
import { useMe } from "./guards";
import { useGrove } from "./provider";
import { TutorialSlotContext, type TutorialSlot } from "./tutorialSlot";

// The house chrome: a header with the way back to the Grove, the app's
// name and nav, and the signed-in person. Apps put their routes inside.
// Styled with the shared theme tokens (theme.css), so it matches the Grove
// without pulling shadcn into the SDK.
export function GroveShell({
  nav = [],
  currentPath,
  actions,
  groveHref = "/",
  children,
}: {
  nav?: { href: string; label: string }[];
  // Highlights the matching nav item; pass the router's current pathname.
  currentPath?: string;
  actions?: ReactNode;
  groveHref?: string;
  children: ReactNode;
}) {
  const { appName, signOut } = useGrove();
  const me = useMe();
  const initials =
    me?.name
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "?";

  // A <GroveTutorial> in `children` hands back a way to reopen itself; an
  // app without one registers nothing and gets no button. The extra arrow
  // is not decoration: setState treats a bare function as an updater.
  const [reopenTutorial, setReopenTutorial] = useState<(() => void) | null>(null);
  const register = useCallback(
    (open: (() => void) | null) => setReopenTutorial(() => open),
    [],
  );
  const slot = useMemo<TutorialSlot>(() => ({ register }), [register]);

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <a
            href={groveHref}
            className="flex items-center gap-2 text-sm font-semibold"
            title="Back to the Grove"
          >
            <GroveIcon className="size-5 shrink-0" />
            <span className="hidden sm:inline">Grove</span>
          </a>
          <span className="text-muted-foreground">/</span>
          <span className="font-semibold">{appName}</span>
          <nav className="ml-4 hidden items-center gap-1 sm:flex">
            {nav.map((item) => {
              const active =
                currentPath !== undefined &&
                (currentPath === item.href || currentPath.startsWith(`${item.href}/`));
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? "rounded-md bg-accent px-3 py-1.5 text-sm font-medium"
                      : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  }
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
          {/* min-w-0 is load-bearing. A flex item defaults to min-width:auto
              and refuses to shrink below its content, so on a phone this
              cluster kept its full width and pushed Sign out clean off the
              screen, with the document scrolling sideways to match. What
              triggers it is an app passing a wide `actions` — Sim passes a
              season selector and the signed-in name — so the shell has to
              survive that rather than trusting every app to stay narrow. */}
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <div className="min-w-0 truncate">{actions}</div>
            {/* Icon-only and shrink-0, for the same reason the comment above
                gives: this cluster has a phone's width to work with, and a
                labelled "Tutorial" button spends it. */}
            {reopenTutorial !== null && (
              <button
                type="button"
                onClick={reopenTutorial}
                title="How this app works"
                aria-label="How this app works"
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <HelpIcon className="size-5" />
              </button>
            )}
            {me && (
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
                title={me.name ?? me.email ?? ""}
              >
                {initials}
              </span>
            )}
            <button
              type="button"
              className="shrink-0 whitespace-nowrap text-sm text-muted-foreground hover:text-foreground"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
        {nav.length > 0 && (
          <nav className="flex gap-1 overflow-x-auto px-4 pb-2 sm:hidden">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
              >
                {item.label}
              </a>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <TutorialSlotContext.Provider value={slot}>{children}</TutorialSlotContext.Provider>
      </main>
    </div>
  );
}

// A question mark in a circle. Hand-drawn like GroveIcon rather than pulled
// from lucide: the SDK deliberately has no icon dependency.
function HelpIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M9.6 9.3a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.3v.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.6" r="1" fill="currentColor" />
    </svg>
  );
}
