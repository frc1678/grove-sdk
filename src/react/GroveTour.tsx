import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// The guided tour: instead of slides in a box, it walks through the app
// itself — goes to the page a step is about, dims everything else, rings
// the real button, and says what it is for. An app's tour is a list of
// TourSteps (src/tutorial.tsx); GroveTutorial runs it on someone's first
// visit and from the menu's "Take the tour".
//
// A step points at elements by CSS selector, best a `data-tour` attribute
// the app puts on the thing. GroveShell and TableToolbar carry their own:
//
//   [data-tour="menu"]              the ☰ menu
//   [data-tour="nav:/queue"]        a page in the inline nav (from navFrom)
//   [data-tour="toolbar-search"]    and -filter, -sort, -group, -more, -primary
//
// Several selectors may be given; the first one visible at this width wins,
// so a step can name the inline nav link and fall back to the menu button on
// a phone. With none visible — a step about the page as a whole — the card
// sits in the middle with nothing ringed.

export type TourStep = {
  title: string;
  body: ReactNode;
  // Selectors tried in order; the first visible match is ringed.
  target?: string | string[];
  // The page (router path, e.g. "/queue") this step is on. The tour goes
  // there before showing it.
  route?: string;
};

type Box = { top: number; left: number; width: number; height: number };

const PAD = 6;
const GAP = 12;
const MARGIN = 12;

function findTarget(target: TourStep["target"]): HTMLElement | null {
  const selectors = target === undefined ? [] : Array.isArray(target) ? target : [target];
  for (const selector of selectors) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return element;
    }
  }
  return null;
}

export function GroveTour({
  steps,
  appName,
  pathname,
  navigate,
  onFinish,
}: {
  steps: TourStep[];
  appName: string;
  // The router's current path, to tell whether a step's page is open.
  pathname?: string;
  navigate?: (to: string) => void;
  // Done, Skip and Escape all land here; the caller records the version.
  onFinish: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [searching, setSearching] = useState(true);
  const [cardHeight, setCardHeight] = useState(220);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index === steps.length - 1;
  const elementRef = useRef<HTMLElement | null>(null);
  // Read when a step starts, not watched: an app hands a new navigate every
  // render, and the step's own navigation changes the path.
  const routeRef = useRef({ pathname, navigate });
  routeRef.current = { pathname, navigate };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
    const onClose = () => onFinish();
    dialog?.addEventListener("close", onClose);
    return () => dialog?.removeEventListener("close", onClose);
  }, [onFinish]);

  const measure = useCallback(() => {
    setViewport({ width: document.documentElement.clientWidth, height: window.innerHeight });
    const element = elementRef.current;
    if (element === null || !element.isConnected) {
      setBox(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    setBox(
      rect.width > 0 && rect.height > 0
        ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        : null,
    );
  }, []);

  // Each step: open its page, then look for its target for a moment — the
  // page may still be loading — and bring it into view.
  useEffect(() => {
    if (step === undefined) return;
    elementRef.current = null;
    setBox(null);
    setSearching(true);
    const { pathname: here, navigate: go } = routeRef.current;
    if (step.route !== undefined && here !== step.route) go?.(step.route);
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const element = findTarget(step.target);
      if (element !== null || tries >= 25 || step.target === undefined) {
        window.clearInterval(timer);
        elementRef.current = element;
        element?.scrollIntoView({ block: "center", inline: "nearest" });
        measure();
        setSearching(false);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [index, step, measure]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  useLayoutEffect(() => {
    const height = cardRef.current?.getBoundingClientRect().height;
    if (height !== undefined && height > 0) setCardHeight(height);
  }, [index, box, searching]);

  const next = () => (last ? onFinish() : setIndex((current) => current + 1));
  const back = () => setIndex((current) => Math.max(0, current - 1));

  // The card goes under the ringed thing if it fits, else above it, else
  // in the middle; never off the screen.
  const width = Math.min(340, (viewport.width || 375) - MARGIN * 2);
  let cardStyle: React.CSSProperties;
  let arrow: { left: number; above: boolean } | null = null;
  if (box === null) {
    cardStyle = { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width };
  } else {
    const below = box.top + box.height + PAD + GAP;
    const fitsBelow = below + cardHeight + MARGIN <= viewport.height;
    const above = box.top - PAD - GAP - cardHeight;
    const fitsAbove = above >= MARGIN;
    const centre = box.left + box.width / 2;
    const left = Math.max(MARGIN, Math.min(centre - width / 2, viewport.width - width - MARGIN));
    if (fitsBelow || !fitsAbove) {
      const top = fitsBelow ? below : Math.max(MARGIN, viewport.height - cardHeight - MARGIN);
      cardStyle = { left, top, width };
      if (fitsBelow) arrow = { left: centre - left, above: true };
    } else {
      cardStyle = { left, top: above, width };
      arrow = { left: centre - left, above: false };
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label={`${appName} tour`}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") next();
        if (event.key === "ArrowLeft") back();
      }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-transparent"
    >
      {/* The dim, with a hole where the ringed element is. */}
      {box === null ? (
        <div className="fixed inset-0 bg-black/60" />
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-xl ring-2 ring-sky-400 transition-all duration-200"
          style={{
            top: box.top - PAD,
            left: box.left - PAD,
            width: box.width + PAD * 2,
            height: box.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
          }}
        />
      )}
      <div
        ref={cardRef}
        role="group"
        aria-roledescription="tour step"
        aria-label={step?.title}
        style={cardStyle}
        className={`fixed rounded-xl border bg-popover p-4 text-popover-foreground shadow-2xl transition-opacity ${searching ? "opacity-0" : "opacity-100"}`}
      >
        {arrow !== null && (
          <div
            aria-hidden="true"
            className={`absolute size-3 rotate-45 border-border bg-popover ${arrow.above ? "-top-1.5 border-t border-l" : "-bottom-1.5 border-r border-b"}`}
            style={{ left: Math.max(14, Math.min(arrow.left - 6, width - 26)) }}
          />
        )}
        <div className="flex items-center text-xs text-muted-foreground">
          <span>
            Step {index + 1} of {steps.length}
          </span>
          <button
            type="button"
            onClick={onFinish}
            className="ml-auto rounded px-1 hover:text-foreground"
          >
            Skip tour
          </button>
        </div>
        <h2 className="mt-1.5 text-base font-semibold leading-snug">{step?.title}</h2>
        <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{step?.body}</div>
        <div className="mt-3 flex items-center gap-1">
          {steps.map((_, dot) => (
            <span
              key={dot}
              aria-hidden="true"
              className={`h-1.5 rounded-full ${dot === index ? "w-4 bg-sky-500" : dot < index ? "w-1.5 bg-sky-500/50" : "w-1.5 bg-foreground/20"}`}
            />
          ))}
          <button
            type="button"
            onClick={back}
            disabled={index === 0}
            className="ml-auto rounded-md border px-3 py-1 text-sm hover:bg-accent disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            autoFocus
            onClick={next}
            className="min-w-16 rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
