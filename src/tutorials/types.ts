import type { ReactNode } from "react";
import type { TutorialCatalogEntry, TutorialRole } from "../build/tutorialCatalog";
import type { FunctionName, SandboxEffect, SandboxTools } from "../sandbox/sandbox";

// A hands-on tutorial: a short task done in the real app, in tutorial mode,
// where nothing is saved (../sandbox/sandbox.ts).
//
// It is written in two halves. The catalog entry (src/tutorial-catalog.ts)
// is what the Grove lists: id, title, summary, points. The script
// (src/tutorials.tsx) is the steps and the practice effects, keyed by the
// same id. defineTutorials joins them.

// What moves a step on. Without one the step has a Next button; with one it
// waits for the person to do the thing, and offers "Skip this step" so a
// page that looks different from what the author expected is never a dead
// end.
export type TutorialUntil =
  // They made this write (a mutation or action), practised or not.
  | { did: FunctionName; when?: (args: any) => boolean }
  // They clicked something matching this selector.
  | { click: string }
  // Something matching this selector is on screen: a dialog opened.
  | { see: string }
  // Nothing matching it is: the dialog closed.
  | { gone: string }
  // They reached this page: an exact router path, or a test of it.
  // A string with a query ("/runs?group=battery") must match it too; a test
  // gets the query string ("?group=battery", or "") as well as the path.
  | { at: string | ((pathname: string, search: string) => boolean) }
  // A field matching this selector holds a value (that `matches` accepts).
  | { value: string; matches?: (value: string) => boolean };

export type TutorialStep = {
  title: string;
  body: ReactNode;
  // The page (router path, "/events") this step starts on. The tutorial
  // goes there when the step opens, unless it is already there.
  route?: string;
  // What to ring: CSS selectors tried in order, the first one visible wins.
  // Best a `data-tour` attribute the app puts on the control. Unlike the
  // tour, the page under the ring stays live: the person uses it.
  target?: string | string[];
  until?: TutorialUntil;
};

export type TutorialScript = {
  steps: TutorialStep[];
  // What each write the tutorial practises would have changed on screen.
  // A write with no effect here is dropped and the person is told.
  effects?: SandboxEffect[];
  // Functions that are safe to really run: actions that only read.
  allow?: FunctionName[];
  // Lays down practice documents before the first step, for a task that
  // needs something to act on which the real data may not have today.
  setup?: (tools: SandboxTools) => void;
};

export type Tutorial = TutorialCatalogEntry & TutorialScript;

// Join the catalog with its scripts. The types make a missing or misspelt
// id a compile error when the catalog comes from defineTutorialCatalog.
export function defineTutorials<const C extends readonly TutorialCatalogEntry[]>(
  catalog: C,
  scripts: Record<C[number]["id"], TutorialScript>,
): Tutorial[] {
  return catalog.map((entry) => {
    const script = (scripts as Record<string, TutorialScript | undefined>)[entry.id];
    if (script === undefined) throw new Error(`[grove] tutorial "${entry.id}" has no steps`);
    return { ...entry, ...script };
  });
}

export { practice } from "../sandbox/practice";

const ORDER: Record<TutorialRole, number> = { student: 0, lead: 1, coach: 2, admin: 3 };

// The tutorials offered to someone in this role. An unknown role (still
// loading) is offered what a student is.
// A tutorial that names `groups` is not held back by role here: the app's
// own capability filter (on the list it hands GroveTutorials) decides, and
// the Grove checks the group itself.
export function tutorialsFor<T extends { minRole?: TutorialRole; groups?: readonly string[] }>(
  tutorials: readonly T[],
  role: TutorialRole | undefined,
): T[] {
  const rank = ORDER[role ?? "student"];
  return tutorials.filter(
    (tutorial) => ORDER[tutorial.minRole ?? "student"] <= rank || (tutorial.groups?.length ?? 0) > 0,
  );
}

// The path part of a step's route: "/orders?tab=open" is on "/orders".
export function routePath(route: string): string {
  return route.split(/[?#]/)[0];
}

// Whether a step's condition holds right now. `did` is not here: it is an
// event, not a state, and the runner listens for it.
export function untilMet(
  until: TutorialUntil,
  pathname: string,
  root: ParentNode,
  search = typeof window === "undefined" ? "" : window.location.search,
): boolean {
  if ("at" in until) {
    if (typeof until.at !== "string") return until.at(pathname, search);
    if (!until.at.includes("?")) return routePath(until.at) === pathname;
    const [path, query] = until.at.split("?");
    const wanted = new URLSearchParams(query);
    const have = new URLSearchParams(search);
    return path === pathname && [...wanted].every(([key, value]) => have.get(key) === value);
  }
  if ("see" in until) return visible(root, until.see) !== null;
  if ("gone" in until) return visible(root, until.gone) === null;
  if ("value" in until) {
    for (const element of root.querySelectorAll(until.value)) {
      const value = (element as HTMLInputElement).value ?? element.textContent ?? "";
      if (value.trim() !== "" && (until.matches === undefined || until.matches(value))) return true;
    }
    return false;
  }
  return false;
}

// The first element matching the selector that takes up space on screen.
export function visible(root: ParentNode, selector: string): HTMLElement | null {
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return element;
  }
  return null;
}

export function findTarget(root: ParentNode, target: TutorialStep["target"]): HTMLElement | null {
  const selectors = target === undefined ? [] : Array.isArray(target) ? target : [target];
  for (const selector of selectors) {
    const element = visible(root, selector);
    if (element !== null) return element;
  }
  return null;
}
