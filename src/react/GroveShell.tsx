import type { ReactNode } from "react";
import { GroveIcon } from "./GroveIcon";
import { useMe } from "./guards";
import { useGrove } from "./provider";
import { TutorialButton, TutorialProvider } from "./tutorialChrome";

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


  // The provider wraps the header too, not just children: the reopen
  // button lives up there and has to see what the tutorial registered.
  return (
    <TutorialProvider>
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
                labelled "Tutorial" button spends it. It renders nothing
                until a tutorial registers itself. */}
            <TutorialButton />
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
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </div>
    </TutorialProvider>
  );
}

