import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TutorialRole } from "../build/tutorialCatalog";
import { functionName, type Sandbox } from "../sandbox";
import {
  findTarget,
  routePath,
  tutorialsFor,
  untilMet,
  type Tutorial,
  type TutorialStep,
} from "./types";

// Tutorial mode: the list of an app's tutorials, and the thing that runs
// one. Unlike the tour (GroveTour), nothing is dimmed and nothing is
// blocked: the page stays live, the person does the task themselves, and
// the sandbox keeps every change in the browser. What is on screen while a
// tutorial runs:
//
//  - an amber frame round the whole page and a strip across the top saying
//    this is practice and nothing is saved, with the way out;
//  - a ring on the control the current step is about;
//  - a small card with the step, out of the way of what it points at.
//
// GroveTutorials (GroveTutorials.tsx) is this wired to a Grove app. The
// Grove itself, which has its own provider tree, renders this directly.

export type TutorialRunnerProps = {
  // The app's sandbox: client.sandbox on a SandboxConvexClient.
  sandbox: Sandbox;
  appName: string;
  tutorials: readonly Tutorial[];
  // The signed-in person's effective role. Tutorials above it are not shown.
  role: TutorialRole | undefined;
  // Ids of the tutorials this person has finished. Undefined while unknown.
  completed: ReadonlySet<string> | undefined;
  // Called once each time someone reaches the end of a tutorial.
  onComplete: (tutorial: Tutorial) => void;
  // The router's current path and its navigate.
  pathname: string;
  navigate: (to: string) => void;
  // The Grove's Tutorials page, linked from the list.
  allHref?: string;
  // Hands the menu a way to open the list, and "2/5" to show beside it.
  register?: (open: (() => void) | null, badge?: string) => void;
};

type Run = {
  tutorial: Tutorial;
  index: number;
  // intro: the "nothing is saved" card. steps: the task. done: finished,
  // still practising. free: finished and carrying on without the card.
  phase: "intro" | "steps" | "done" | "free";
  // Whether finishing earned the points, or they were already earned.
  first: boolean;
};

type Box = { top: number; left: number; width: number; height: number };

// The height of the strip across the top, which the page moves down by.
const STRIP = 28;
const PAD = 5;
// How long a finished step shows its tick before the next one opens.
const TICK_MS = 650;
// A blocked write only earns a notice if the person just did something:
// apps also write on timers (presence, autosave), and those are not news.
const GESTURE_MS = 2500;

const MODE_CLASS = "grove-tutorial-mode";
const STYLE_ID = "grove-tutorial-style";
// The page moves down by the strip, and the shell's header sticks below it
// (GroveShell reads --grove-tutorial-top).
const MODE_CSS = `html.${MODE_CLASS}{--grove-tutorial-top:${STRIP}px}html.${MODE_CLASS} body{padding-top:${STRIP}px}`;

function points(count: number): string {
  return `${count} point${count === 1 ? "" : "s"}`;
}

export function TutorialRunner({
  sandbox,
  appName,
  tutorials,
  role,
  completed,
  onComplete,
  pathname,
  navigate,
  allHref,
  register,
}: TutorialRunnerProps) {
  const offered = useMemo(() => tutorialsFor(tutorials, role), [tutorials, role]);
  const [listOpen, setListOpen] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [ticked, setTicked] = useState(false);
  const [notice, setNotice] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [cardHeight, setCardHeight] = useState(200);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const layerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDialogElement>(null);
  const listHeading = useId();
  const elementRef = useRef<HTMLElement | null>(null);
  const lastGesture = useRef(0);
  // Read by effects that must not restart when the page or the app's
  // navigate changes: an app hands a new navigate on every render.
  const here = useRef({ pathname, navigate, completed, onComplete });
  here.current = { pathname, navigate, completed, onComplete };
  const runRef = useRef(run);
  runRef.current = run;

  const step: TutorialStep | undefined =
    run !== null && run.phase === "steps" ? run.tutorial.steps[run.index] : undefined;
  const doneCount = offered.filter((tutorial) => completed?.has(tutorial.id) === true).length;

  // ——— Opening the list ———

  const openList = useCallback(() => setListOpen(true), []);
  const hasTutorials = offered.length > 0;
  const badge = completed === undefined ? undefined : `${doneCount}/${offered.length}`;
  useEffect(() => {
    if (register === undefined || !hasTutorials) return;
    register(openList, badge);
    return () => register(null);
  }, [register, openList, hasTutorials, badge]);

  useEffect(() => {
    const dialog = listRef.current;
    if (dialog === null) return;
    if (listOpen && !dialog.open) dialog.showModal();
    if (!listOpen && dialog.open) dialog.close();
  }, [listOpen]);

  // ——— Starting and leaving ———

  const start = useCallback(
    (tutorial: Tutorial) => {
      setListOpen(false);
      setTicked(false);
      setNotice(false);
      setHidden(false);
      setRun({ tutorial, index: 0, phase: "intro", first: false });
    },
    [],
  );

  // The sandbox is open exactly while a tutorial is running, and that is
  // decided here and nowhere else. The amber frame is drawn from `run`, so
  // if anything else could close the sandbox the frame would promise
  // "nothing is saved" over a page that saves. (React's StrictMode found
  // this: it runs every effect's cleanup once on mount, which closed a
  // sandbox that a ?tutorial= link had just opened.) The intro card stands
  // between starting and the first step, so the sandbox is open before
  // anyone can act.
  const runningTutorial = run?.tutorial;
  useEffect(() => {
    if (runningTutorial === undefined) return;
    sandbox.enter({ effects: runningTutorial.effects, allow: runningTutorial.allow, setup: runningTutorial.setup });
    return () => sandbox.exit();
  }, [sandbox, runningTutorial]);

  const exit = useCallback(() => {
    // A page showing a practice document has nothing left to show.
    const leave = sandbox.madePracticeDocs;
    const home = run?.tutorial.steps.find((item) => item.route !== undefined)?.route ?? "/";
    setRun(null);
    if (leave) here.current.navigate(home);
  }, [sandbox, run]);

  const finish = useCallback((current: Run) => {
    const first = here.current.completed?.has(current.tutorial.id) !== true;
    here.current.onComplete(current.tutorial);
    setRun({ ...current, phase: "done", first });
  }, []);

  const advance = useCallback(() => {
    setTicked(false);
    const current = runRef.current;
    if (current === null || current.phase !== "steps") return;
    if (current.index < current.tutorial.steps.length - 1) {
      setRun({ ...current, index: current.index + 1 });
    } else {
      finish(current);
    }
  }, [finish]);

  const back = useCallback(() => {
    setTicked(false);
    setRun((current) =>
      current === null || current.phase !== "steps" || current.index === 0
        ? current
        : { ...current, index: current.index - 1 },
    );
  }, []);

  // A link from the Grove's Tutorials page: /<slug>/?tutorial=<id> starts
  // that one, and ?tutorial alone opens the list.
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current || offered.length === 0) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("tutorial")) return;
    linked.current = true;
    const wanted = offered.find((tutorial) => tutorial.id === url.searchParams.get("tutorial"));
    url.searchParams.delete("tutorial");
    window.history.replaceState(window.history.state, "", url);
    if (wanted !== undefined) start(wanted);
    else setListOpen(true);
  }, [offered, start]);

  // ——— The frame ———

  const running = run !== null;
  useEffect(() => {
    if (!running) return;
    if (document.getElementById(STYLE_ID) === null) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = MODE_CSS;
      document.head.appendChild(style);
    }
    document.documentElement.classList.add(MODE_CLASS);
    return () => document.documentElement.classList.remove(MODE_CLASS);
  }, [running]);

  // The layer goes in the browser's top layer, so a dialog the app opens
  // never covers the card.
  useEffect(() => {
    const layer = layerRef.current;
    if (!running || layer === null || typeof layer.showPopover !== "function") return;
    try {
      layer.showPopover();
    } catch {
      // Already showing.
    }
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const onGesture = () => {
      lastGesture.current = Date.now();
    };
    window.addEventListener("pointerdown", onGesture, true);
    window.addEventListener("keydown", onGesture, true);
    return () => {
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
    };
  }, [running]);

  // ——— The current step ———

  const measure = useCallback(() => {
    setViewport({ width: document.documentElement.clientWidth, height: window.innerHeight });
    const element = elementRef.current;
    if (element === null || !element.isConnected) {
      setBox(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    const left = Math.max(rect.left, PAD);
    const top = Math.max(rect.top, STRIP + PAD);
    const right = Math.min(rect.right, document.documentElement.clientWidth - PAD);
    const bottom = Math.min(rect.bottom, window.innerHeight - PAD);
    const next =
      right > left && bottom > top ? { top, left, width: right - left, height: bottom - top } : null;
    setBox((current) =>
      current !== null &&
      next !== null &&
      current.top === next.top &&
      current.left === next.left &&
      current.width === next.width &&
      current.height === next.height
        ? current
        : next,
    );
  }, []);

  // Open the step's page, then keep looking for what it points at: the
  // target is often inside a dialog the person has yet to open. The same
  // tick checks whether they have done what the step waits for.
  useEffect(() => {
    if (step === undefined) {
      elementRef.current = null;
      setBox(null);
      return;
    }
    elementRef.current = null;
    setBox(null);
    const { pathname: path, navigate: go } = here.current;
    if (step.route !== undefined && routePath(step.route) !== path) go(step.route);
    let met = false;
    let scrolled = false;
    let topLayer = 0;
    const pass = () => {
      if (met) return;
      met = true;
      setTicked(true);
      window.setTimeout(advance, TICK_MS);
    };
    const look = () => {
      const found = findTarget(document, step.target);
      if (found !== elementRef.current) {
        elementRef.current = found;
        if (found !== null && !scrolled) {
          scrolled = true;
          found.scrollIntoView({ block: "center", inline: "nearest" });
        }
      }
      measure();
      // A dialog opened with showModal() joins the top layer above this
      // one. Showing the layer again puts it back on top.
      const modals = document.querySelectorAll("dialog[open]").length;
      const layer = layerRef.current;
      if (modals !== topLayer && layer !== null && typeof layer.showPopover === "function") {
        topLayer = modals;
        try {
          layer.hidePopover();
          layer.showPopover();
        } catch {
          // Not showing yet; the effect above shows it.
        }
      }
      const until = step.until;
      if (until !== undefined && !("did" in until) && !("click" in until)) {
        if (untilMet(until, here.current.pathname, document)) pass();
      }
    };
    // Not on the first tick for a state the page may already be in from the
    // step before: give the page a beat to settle.
    const timer = window.setInterval(look, 250);
    const first = window.setTimeout(look, 60);

    const until = step.until;
    const offEvent =
      until !== undefined && "did" in until
        ? sandbox.onEvent((event) => {
            if (event.name !== functionName(until.did)) return;
            if (until.when !== undefined && !until.when(event.args)) return;
            pass();
          })
        : () => {};
    const onClick = (event: MouseEvent) => {
      if (until === undefined || !("click" in until)) return;
      const target = event.target;
      if (target instanceof Element && target.closest(until.click) !== null) pass();
    };
    document.addEventListener("click", onClick, true);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(first);
      offEvent();
      document.removeEventListener("click", onClick, true);
    };
  }, [step, sandbox, advance, measure]);

  useEffect(() => {
    if (!running) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    measure();
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [running, measure]);

  // A write the tutorial does not practise was dropped. Say so, briefly.
  useEffect(() => {
    if (!running) return;
    let timer = 0;
    const off = sandbox.onEvent((event) => {
      if (event.kind !== "blocked") return;
      if (Date.now() - lastGesture.current > GESTURE_MS) return;
      setNotice(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setNotice(false), 5000);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [running, sandbox]);

  useLayoutEffect(() => {
    const height = cardRef.current?.getBoundingClientRect().height;
    if (height !== undefined && height > 0) setCardHeight(height);
  }, [run, box, notice, ticked, hidden]);

  // ——— Drawing ———

  const next = offered.find(
    (tutorial) => tutorial.id !== run?.tutorial.id && completed?.has(tutorial.id) !== true,
  );

  // The card sits at the bottom, on the right from a tablet up, and moves
  // out of the way when the thing it points at is underneath it.
  const phone = viewport.width > 0 && viewport.width < 640;
  const cardWidth = phone ? viewport.width - 16 : 368;
  const cardTop = viewport.height - cardHeight - 12;
  const under = box !== null && box.top + box.height > cardTop - 8;
  let cardStyle: React.CSSProperties;
  if (phone) {
    cardStyle = under
      ? { left: 8, top: STRIP + 8, width: cardWidth }
      : { left: 8, bottom: 8, width: cardWidth };
  } else {
    const onRight = box !== null && box.left + box.width > viewport.width - cardWidth - 24;
    cardStyle =
      under && onRight
        ? { left: 12, bottom: 12, width: cardWidth }
        : { right: 12, bottom: 12, width: cardWidth };
  }

  return (
    <>
      {run !== null && (
        <div
          ref={layerRef}
          popover="manual"
          // aria-live for the step changing under a screen reader, and so a
          // dialog library that hides everything outside its dialog leaves
          // this alone: they all spare live regions.
          aria-live="polite"
          className="pointer-events-none fixed inset-0 z-[2147483000] m-0 h-full max-h-none w-full max-w-none overflow-visible border-0 bg-transparent p-0 text-foreground"
        >
          {/* The frame: this is practice. */}
          <div
            aria-hidden="true"
            className="fixed inset-0 border-[3px] border-amber-500"
            style={{ boxShadow: "inset 0 0 48px rgba(245, 158, 11, 0.22)" }}
          />
          <div
            className="pointer-events-auto fixed inset-x-0 top-0 flex items-center gap-2 bg-amber-500 px-3 text-xs font-medium text-black"
            style={{ height: STRIP }}
          >
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold uppercase tracking-wide">Tutorial mode</span>
              <span> · nothing is saved</span>
            </span>
            <button
              type="button"
              onClick={exit}
              className="shrink-0 rounded px-2 py-0.5 font-semibold underline-offset-2 hover:bg-black/10 hover:underline"
            >
              Exit tutorial
            </button>
          </div>

          {box !== null && step !== undefined && (
            <div
              aria-hidden="true"
              className="pointer-events-none fixed rounded-lg ring-[3px] ring-amber-500 transition-all duration-150"
              style={{
                top: box.top - PAD,
                left: box.left - PAD,
                width: box.width + PAD * 2,
                height: box.height + PAD * 2,
                boxShadow: "0 0 0 6px rgba(245, 158, 11, 0.25)",
              }}
            />
          )}

          {hidden ? (
            <button
              type="button"
              onClick={() => setHidden(false)}
              className="pointer-events-auto fixed right-3 bottom-3 rounded-full border border-amber-500 bg-popover px-3 py-1.5 text-sm font-medium text-popover-foreground shadow-lg"
            >
              Show the step
            </button>
          ) : (
            <div
              ref={cardRef}
              role="group"
              aria-label={`${appName} tutorial: ${run.tutorial.title}`}
              style={cardStyle}
              className="pointer-events-auto fixed flex max-h-[min(24rem,55svh)] flex-col rounded-xl border border-amber-500/60 bg-popover text-popover-foreground shadow-2xl"
            >
              <div className="flex items-center gap-2 px-4 pt-3 text-xs text-muted-foreground">
                <span className="min-w-0 flex-1 truncate">
                  {run.phase === "steps"
                    ? `${run.tutorial.title} · step ${run.index + 1} of ${run.tutorial.steps.length}`
                    : run.tutorial.title}
                </span>
                <button
                  type="button"
                  onClick={() => setHidden(true)}
                  className="shrink-0 rounded px-1 hover:text-foreground"
                >
                  Hide
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1.5 pb-3">
                {run.phase === "intro" && (
                  <>
                    <h2 className="text-base font-semibold leading-snug">You're in tutorial mode</h2>
                    <div className="mt-1 grid gap-2 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        This is the real {appName}, with the real data on screen. While the amber
                        frame is up, <strong className="text-foreground">nothing you do is saved</strong>
                        : your changes show on this screen only, nobody else sees them, and they
                        are gone when you leave.
                      </p>
                      <p>So go ahead and change things. You can't break anything here.</p>
                    </div>
                  </>
                )}
                {step !== undefined && (
                  <>
                    <h2 className="flex items-start gap-2 text-base font-semibold leading-snug">
                      <span className="min-w-0 flex-1">{step.title}</span>
                      {ticked && (
                        <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
                          Done
                        </span>
                      )}
                    </h2>
                    <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</div>
                  </>
                )}
                {run.phase === "done" && (
                  <>
                    <h2 className="text-base font-semibold leading-snug">Tutorial complete</h2>
                    <div className="mt-1 grid gap-2 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        {run.first ? (
                          <>
                            <strong className="text-foreground">
                              +{points(run.tutorial.points)}
                            </strong>{" "}
                            for finishing “{run.tutorial.title}”.
                          </>
                        ) : (
                          <>You already have the {points(run.tutorial.points)} for this one.</>
                        )}
                      </p>
                      <p>
                        You're still in tutorial mode. Keep trying things if you like: none of it
                        is saved.
                      </p>
                    </div>
                  </>
                )}
                {run.phase === "free" && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Still in tutorial mode. Try anything: nothing is saved. Exit when you're done.
                  </p>
                )}
                {notice && (
                  <p className="mt-2 rounded-md bg-amber-500/15 px-2 py-1.5 text-xs leading-relaxed text-foreground">
                    That isn't part of this tutorial, so it was skipped. Nothing was saved.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 border-t px-4 py-2.5">
                {run.phase === "intro" && (
                  <button
                    type="button"
                    onClick={() => setRun({ ...run, phase: "steps" })}
                    className="ml-auto min-w-20 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    Start
                  </button>
                )}
                {step !== undefined && (
                  <>
                    <div className="flex min-w-0 flex-1 items-center gap-1" aria-hidden="true">
                      {run.tutorial.steps.map((_, dot) => (
                        <span
                          key={dot}
                          className={`h-1.5 rounded-full ${dot === run.index ? "w-4 bg-amber-500" : dot < run.index ? "w-1.5 bg-amber-500/60" : "w-1.5 bg-foreground/20"}`}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={back}
                      disabled={run.index === 0}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-40"
                    >
                      Back
                    </button>
                    {step.until === undefined ? (
                      <button
                        type="button"
                        onClick={advance}
                        className="min-w-20 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                      >
                        {run.index === run.tutorial.steps.length - 1 ? "Finish" : "Next"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={advance}
                        disabled={ticked}
                        className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                      >
                        Skip this step
                      </button>
                    )}
                  </>
                )}
                {run.phase === "done" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setRun({ ...run, phase: "free" })}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
                    >
                      Keep practicing
                    </button>
                    {next !== undefined ? (
                      <button
                        type="button"
                        onClick={() => start(next)}
                        className="ml-auto min-w-0 truncate rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                      >
                        Next: {next.title}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={exit}
                        className="ml-auto min-w-20 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                      >
                        Done
                      </button>
                    )}
                  </>
                )}
                {run.phase === "free" && (
                  <button
                    type="button"
                    onClick={exit}
                    className="ml-auto rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    Exit tutorial
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <dialog
        ref={listRef}
        aria-labelledby={listHeading}
        onClose={() => setListOpen(false)}
        className="m-auto w-[calc(100vw-2rem)] max-w-lg rounded-xl border bg-card p-0 text-card-foreground shadow-lg backdrop:bg-black/50 max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0"
      >
        {listOpen && (
        <div className="flex max-h-[min(40rem,calc(100svh-2rem))] flex-col max-sm:max-h-[calc(100svh-4.5rem)] max-sm:pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {appName}
                {completed !== undefined && ` · ${doneCount} of ${offered.length} done`}
              </p>
              <h2 id={listHeading} className="mt-1 text-2xl font-semibold tracking-tight">
                Tutorials
              </h2>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setListOpen(false)}
              className="-mr-1 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm leading-relaxed">
              Each one is a short task you do yourself, in the real app. While a tutorial is
              running <strong>nothing you change is saved</strong> and nobody else sees it, so try
              things freely.
            </p>
            <ul className="mt-3 grid gap-2">
              {offered.map((tutorial) => {
                const done = completed?.has(tutorial.id) === true;
                return (
                  <li key={tutorial.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                    <span
                      aria-hidden="true"
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-emerald-600 text-white" : "border text-muted-foreground"}`}
                    >
                      {done ? "✓" : ""}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">{tutorial.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {tutorial.summary}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tutorial.minutes !== undefined && `About ${tutorial.minutes} min · `}
                        {points(tutorial.points)}
                        {done && " · done"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => start(tutorial)}
                      className={
                        done
                          ? "shrink-0 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
                          : "shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                      }
                    >
                      {done ? "Again" : "Start"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {allHref !== undefined && (
            <div className="border-t px-5 py-3">
              <a href={allHref} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Every app's tutorials, and your points
              </a>
            </div>
          )}
        </div>
        )}
      </dialog>
    </>
  );
}
