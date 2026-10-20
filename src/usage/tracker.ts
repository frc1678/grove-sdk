// How an app is used, counted by the Grove (grove/convex/usage.ts): which
// pages are opened and which named actions happen, by role and subteam,
// never by whom. This module only collects and batches. The Grove decides
// what to keep, reads role and subteam from the session itself, and keeps
// no user id, so nothing here needs to be careful about who is signed in.
//
// Page views are recorded on their own: the tracker watches the URL's path
// rather than hooking any router, so every app gets them unchanged. Named
// events come from useGroveEvent / trackGroveEvent.

export type UsageEvent = { name: string; at: number; path?: string };
export type UsageBatch = { app: string; sessionId: string; events: UsageEvent[] };

export const PAGE_VIEW = "page_view";
// The Grove's limits (lib/usage.ts): keep the two in step.
export const BATCH_MAX = 50;
const EVENT_NAME = /^[a-z][a-z0-9_.:-]{0,63}$/;

const FLUSH_MS = 30_000;
const PATH_POLL_MS = 1_000;
// A tab quiet this long starts a new session.
const SESSION_IDLE_MS = 30 * 60 * 1000;
// What waits while the Grove can't be reached; beyond it the oldest go.
const QUEUE_MAX = 200;
// After this many failed sends in a row, stop for the life of the page: an
// older Grove without usage.record, or an account it won't count (pending).
const GIVE_UP_AFTER = 3;
const SESSION_KEY = "grove-usage-session";

export type UsageTrackerOptions = {
  app: string;
  send: (batch: UsageBatch) => Promise<unknown>;
  // Defaults to the browser's; tests pass their own.
  now?: () => number;
  path?: () => string;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  // Calls back when the page is about to be hidden; returns an unsubscribe.
  onHidden?: (callback: () => void) => () => void;
};

export type UsageTracker = {
  start: () => void;
  stop: () => void;
  track: (name: string, path?: string) => void;
  flush: () => Promise<void>;
};

function browserStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function onPageHidden(callback: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const listener = () => {
    if (document.visibilityState === "hidden") callback();
  };
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("");
}

export function createUsageTracker(options: UsageTrackerOptions): UsageTracker {
  const now = options.now ?? (() => Date.now());
  const path = options.path ?? (() => (typeof location === "undefined" ? "/" : location.pathname));
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const subscribeHidden = options.onHidden ?? onPageHidden;

  let queue: UsageEvent[] = [];
  let lastPath: string | undefined;
  let sending = false;
  let failures = 0;
  let timers: ReturnType<typeof setInterval>[] = [];
  let unsubscribe: (() => void) | undefined;

  // One id per tab while it is in use, kept in sessionStorage so a reload
  // stays the same session; a new one after SESSION_IDLE_MS of quiet.
  type Session = { id: string; last: number };
  let session: Session | undefined;
  const sessionId = (at: number): string => {
    if (session === undefined) {
      try {
        const saved = JSON.parse(storage?.getItem(SESSION_KEY) ?? "null") as Session | null;
        if (saved && typeof saved.id === "string" && typeof saved.last === "number") session = saved;
      } catch {
        // A corrupt or blocked entry just means a new session.
      }
    }
    if (session === undefined || at - session.last > SESSION_IDLE_MS) {
      session = { id: randomId(), last: at };
    }
    session.last = at;
    try {
      storage?.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // Private mode: the session lasts as long as the page instead.
    }
    return session.id;
  };

  const flush = async () => {
    if (sending || queue.length === 0 || failures >= GIVE_UP_AFTER) return;
    const events = queue.slice(0, BATCH_MAX);
    queue = queue.slice(events.length);
    sending = true;
    try {
      await options.send({ app: options.app, sessionId: sessionId(now()), events });
      failures = 0;
    } catch {
      failures++;
      queue = [...events, ...queue].slice(-QUEUE_MAX);
    } finally {
      sending = false;
    }
  };

  const track = (name: string, eventPath?: string) => {
    if (!EVENT_NAME.test(name)) {
      console.warn(`Grove usage: "${name}" isn't an event name (lowercase, digits, . _ : -)`);
      return;
    }
    const at = now();
    sessionId(at);
    queue.push(eventPath === undefined ? { name, at } : { name, at, path: eventPath });
    if (queue.length > QUEUE_MAX) queue = queue.slice(-QUEUE_MAX);
    if (queue.length >= BATCH_MAX) void flush();
  };

  const checkPath = () => {
    const current = path();
    if (current !== lastPath) {
      lastPath = current;
      track(PAGE_VIEW, current);
    }
  };

  return {
    start() {
      if (timers.length > 0) return;
      checkPath();
      timers = [setInterval(checkPath, PATH_POLL_MS), setInterval(() => void flush(), FLUSH_MS)];
      unsubscribe = subscribeHidden(() => void flush());
    },
    stop() {
      for (const timer of timers) clearInterval(timer);
      timers = [];
      unsubscribe?.();
      unsubscribe = undefined;
      void flush();
    },
    track,
    flush,
  };
}

// The tracker the mounted <GroveUsage> runs, so trackGroveEvent works from
// anywhere in the app without a hook.
let active: UsageTracker | null = null;

/** @internal Set by GroveUsage. */
export function setActiveTracker(tracker: UsageTracker | null): void {
  active = tracker;
}

/** @internal */
export function activeTracker(): UsageTracker | null {
  return active;
}

// Count a named action: trackGroveEvent("mission.created"). Lowercase
// letters, digits and . _ : -, at most 64 characters. Name the action, not
// the person or the record: nothing else is sent with it. A no-op until
// someone is signed in.
export function trackGroveEvent(name: string): void {
  active?.track(name);
}
