import { useMutation, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useMe } from "./guards";
import { useGrove } from "./provider";
import { useTutorialSlot } from "./tutorialSlot";
import {
  autoOpening,
  unseenChanges,
  type ChangelogEntry,
  type TutorialSlide,
} from "./tutorialState";

// The first-run tutorial every Grove app shows, and the "What's new" note
// that replaces it for everyone who has seen it before. The mechanism is
// shared; the slides and the changelog are the app's. Put it inside
// GroveShell and the header grows a help button that reopens the tutorial:
//
//   <GroveShell nav={nav}>
//     <Outlet />
//     <GroveTutorial
//       version={TUTORIAL_VERSION}
//       slides={slides}
//       changelog={changelog}
//       seenVersion={api.tutorial.seenVersion}
//       markSeen={api.tutorial.markSeen}
//     />
//   </GroveShell>
//
// It belongs behind RequireSignedIn: both wrapped functions derive the
// caller from the Grove's token and refuse anyone who isn't active.

export type GroveTutorialProps = {
  // The app's major version. Bumping it shows newcomers the tutorial and
  // everyone else the changelog entries they have not seen.
  version: number;
  slides: TutorialSlide[];
  // What changed in each major version. Someone coming back after a bump
  // gets the entries since the version they last dismissed instead of the
  // whole tutorial again. A bump with no entry opens nothing.
  changelog?: ChangelogEntry[];
  // The app's thin wrappers over the SDK's tutorial helpers.
  seenVersion: FunctionReference<"query", "public", Record<string, never>, number | null>;
  markSeen: FunctionReference<"mutation", "public", { version: number }, null>;
  // Header of the dialog and the tooltip on the header button.
  title?: string;
};

export function GroveTutorial({
  version,
  slides,
  changelog = NO_CHANGES,
  seenVersion,
  markSeen,
  title = "How this app works",
}: GroveTutorialProps) {
  const me = useMe();
  const { appName } = useGrove();
  const seen = useQuery(seenVersion, {});
  const record = useMutation(markSeen);
  const slot = useTutorialSlot();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"tutorial" | "changelog">("tutorial");
  const [step, setStep] = useState(0);
  // Held rather than derived: dismissing records the version, the
  // seen-version query re-resolves, and a derived list would empty itself
  // while the dialog was still on screen.
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  // Auto-open is once per page load. Without this, closing the tutorial and
  // then having the seen-version query re-resolve would open it again.
  const offered = useRef(false);

  const show = useCallback(() => {
    setMode("tutorial");
    setStep(0);
    setOpen(true);
  }, []);

  // Record first, then close. Hanging the recording solely off the dialog's
  // `close` event looked tidier and did not work: closing through React left
  // the event unfired, so skipping never persisted and the tutorial came
  // back on the next load. Every explicit exit calls this directly, and the
  // close listener below still calls it for Escape, which bypasses React
  // entirely. Recording twice is harmless — recordTutorialView is a no-op
  // when the row already exists.
  const dismiss = useCallback(() => {
    void record({ version });
    setOpen(false);
  }, [record, version]);

  useEffect(() => {
    if (offered.current) return;
    const opening = autoOpening({
      seenVersion: seen,
      version,
      status: me?.status,
      slideCount: slides.length,
      changelog,
    });
    if (opening === null) return;
    offered.current = true;
    if (opening === "tutorial") {
      show();
      return;
    }
    setEntries(unseenChanges(changelog, seen ?? 0, version));
    setMode("changelog");
    setOpen(true);
  }, [seen, version, me?.status, slides.length, changelog, show]);

  // Lend the header a way back in, but only while there is something to
  // show. Registering null on unmount takes the button away with it.
  useEffect(() => {
    if (slides.length === 0) return;
    slot.register(show);
    return () => slot.register(null);
  }, [slot, show, slides.length]);

  // showModal() is what makes this a real dialog rather than a div on top
  // of the page: focus moves in, the rest of the document leaves the tab
  // order, Escape closes it, and focus returns to whatever opened it. None
  // of that is worth hand-rolling.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Every exit lands here — Done, Skip, the close button, and Escape, which
  // closes the dialog natively without going through React. Recording from
  // the close event rather than from each button is what makes skipping
  // count as seen.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const onClose = () => {
      dismiss();
    };
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [dismiss]);

  if (slides.length === 0 && changelog.length === 0) return null;
  const showingChanges = mode === "changelog";
  const slide = slides[Math.min(step, slides.length - 1)];
  const last = step === slides.length - 1;

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      // w-[calc(100vw-2rem)] rather than a fixed width: the phone case is
      // the one that breaks, and the UA's own max-width is not enough.
      className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-xl border bg-card p-0 text-card-foreground shadow-lg backdrop:bg-black/50"
    >
      {/* One fixed height for every slide, capped to the viewport. Sizing to
        the content instead let a short slide draw a short dialog and a long
        one a tall dialog, so Next and Back jumped to a new place on the
        screen at every step and people missed them. The body scrolls inside
        this box; the header and footer do not move. */}
      <div className="flex h-[min(32rem,calc(100svh-2rem))] flex-col">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {showingChanges
                ? `${appName} · ${majorLabel(version)}`
                : `${title} · step ${step + 1} of ${slides.length}`}
            </p>
            <h2 id={headingId} className="mt-1 text-2xl font-semibold tracking-tight">
              {showingChanges ? "What's new" : slide.title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={dismiss}
            className="-mr-1 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </button>
        </div>

        {showingChanges ? (
          <>
            <ChangesBody entries={entries} />
            <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
              {/* The way back to the whole walkthrough for anyone who wants
                it, without making everyone sit through it. */}
              {slides.length > 0 ? (
                <button
                  type="button"
                  onClick={show}
                  className="min-w-0 truncate text-sm text-muted-foreground hover:text-foreground"
                >
                  See the tutorial
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={dismiss}
                className="min-w-20 shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Got it
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {/* Centred while the slide is short, scrolled once it is not. */}
              <div className="grid min-h-full content-center gap-4">
                {slide.icon !== undefined && (
                  <div className="flex items-center justify-center rounded-lg bg-muted py-6 text-muted-foreground">
                    {slide.icon}
                  </div>
                )}
                <div className="text-sm leading-relaxed text-muted-foreground">{slide.body}</div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
              <button
                type="button"
                onClick={dismiss}
                className="shrink-0 text-sm text-muted-foreground hover:text-foreground"
              >
                Skip
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={step === 0}
                  onClick={() => setStep((current) => current - 1)}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => (last ? dismiss() : setStep((current) => current + 1))}
                  // min-w keeps Done exactly as wide as Next, so the last step
                  // does not nudge the button sideways under a waiting thumb.
                  className="min-w-20 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  {last ? "Done" : "Next"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}

const NO_CHANGES: ChangelogEntry[] = [];

// The same two-digit major the header's Vxx.yy badge leads with, so the
// number here is one people can match against what they see.
function majorLabel(version: number): string {
  return `V${String(Math.max(0, Math.trunc(version))).padStart(2, "0")}`;
}

function ChangesBody({ entries }: { entries: ChangelogEntry[] }) {
  // A version label on each section only earns its place when there is
  // more than one to tell apart, or a headline to hang it on.
  const labelled = entries.length > 1 || entries.some((entry) => entry.title !== undefined);
  return (
    <div className="flex-1 overflow-y-auto px-5 py-5">
      <div className="grid gap-5">
        {entries.map((entry) => (
          <section key={entry.version} className="grid gap-2">
            {labelled && (
              <h3 className="text-sm font-semibold text-foreground">
                {majorLabel(entry.version)}
                {entry.title !== undefined && ` · ${entry.title}`}
              </h3>
            )}
            <ul className="grid list-disc gap-2 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-muted-foreground/60">
              {entry.changes.map((change, index) => (
                <li key={index}>{change}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
