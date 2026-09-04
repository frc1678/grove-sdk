import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  TutorialOpenContext,
  TutorialSlotContext,
  useReopenTutorial,
  type TutorialSlot,
} from "./tutorialSlot";

// GroveShell publishes the tutorial slot itself, so an app that uses the
// house chrome gets the reopen button for free. Most Grove apps do not use
// it — Chime, Forms and the Mission Planner all draw their own headers,
// because they need nav, a mode toggle, and a mobile menu the shell has no
// opinion about. Those apps used to get a tutorial that opened once and
// could never be reopened, which is half a feature.
//
// So the two halves are separately usable: wrap the layout in
// <TutorialProvider> and put <TutorialButton /> wherever the header has
// room. GroveShell is built from exactly these, so there is one behaviour
// rather than two implementations that drift.

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [reopen, setReopen] = useState<(() => void) | null>(null);
  // The extra arrow is not decoration: setState treats a bare function as
  // an updater, so `setReopen(open)` would call the tutorial instead of
  // storing it.
  const register = useCallback(
    (open: (() => void) | null) => setReopen(() => open),
    [],
  );
  const slot = useMemo<TutorialSlot>(() => ({ register }), [register]);

  return (
    <TutorialSlotContext.Provider value={slot}>
      <TutorialOpenContext.Provider value={reopen}>{children}</TutorialOpenContext.Provider>
    </TutorialSlotContext.Provider>
  );
}

/**
 * The reopen button. Renders nothing until a <GroveTutorial> inside the
 * same <TutorialProvider> has registered itself, so an app with no tutorial
 * — or a page rendered before it mounts — shows no dead control, and there
 * is no flag to pass and keep in step.
 */
export function TutorialButton({ className }: { className?: string }) {
  const reopen = useReopenTutorial();
  if (reopen === null) return null;

  return (
    <button
      type="button"
      onClick={reopen}
      title="How this app works"
      aria-label="How this app works"
      className={
        className ??
        "flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
      }
    >
      <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M7.6 7.6a2.4 2.4 0 1 1 3.2 2.26c-.5.18-.8.66-.8 1.19v.2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="10" cy="14.4" r="0.9" fill="currentColor" />
      </svg>
    </button>
  );
}
