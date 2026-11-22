import { getFunctionName, type FunctionReference } from "convex/server";

// Tutorial mode's practice sandbox.
//
// A tutorial runs on the real app, over the real data on screen, and asks
// people to change things. None of it may reach the server. So while the
// sandbox is active the app's Convex client (SandboxConvexClient) hands
// every write to this instead of sending it:
//
//  - a write the tutorial practises has an *effect*: a function that says
//    what the write would have changed on screen. It edits query results in
//    the browser, on top of whatever the server last sent;
//  - any other write is dropped, and reported so the tutorial can say it was
//    not saved.
//
// Reads carry on untouched, so the page keeps showing live production data
// with the practice changes layered over it. Leaving the sandbox throws the
// layer away and the page shows the server's answer again.
//
// This file is the layer itself, with no React and no Convex client in it,
// so its rules can be tested directly.

// Ids the sandbox hands out for practice documents. They are not Convex ids:
// a query that mentions one is answered here and never sent (see `view`).
export const PRACTICE_PREFIX = "practice-";

type AnyRef = FunctionReference<"query" | "mutation" | "action", "public" | "internal">;
export type FunctionName = string | AnyRef;

export function functionName(fn: FunctionName): string {
  return typeof fn === "string" ? fn : getFunctionName(fn);
}

// True when a value has a practice id anywhere inside it.
export function mentionsPractice(value: unknown): boolean {
  if (typeof value === "string") return value.startsWith(PRACTICE_PREFIX);
  if (Array.isArray(value)) return value.some(mentionsPractice);
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(mentionsPractice);
  }
  return false;
}

type Doc = Record<string, unknown>;
type Change = (result: any, args: any) => unknown;
type Respond = (args: any) => unknown;

// What an effect is given to describe a practice change.
export type SandboxTools = {
  // A fresh practice id: tools.id("task") → "practice-task-3". Typed loosely
  // on purpose: it stands in for an Id<"tasks">, so an effect can return it
  // where the real mutation returns one.
  id: (label?: string) => any;
  // Who is practising, for a document that shows its author. Empty until
  // the app knows.
  me: { name?: string; userId?: string };
  // A practice document: the fields, plus a practice `_id` and a
  // `_creationTime` of now, as a real insert would have given it.
  doc: <T extends Doc>(label: string, fields: T) => T & { _id: any; _creationTime: number };
  now: () => number;
  // Change what a query shows, for every set of arguments it is watched
  // with. `change` gets the server's result (never undefined) and the
  // arguments; return the result unchanged where it does not apply.
  edit: <T = any>(query: FunctionName, change: (result: T, args: any) => T) => void;
  // Answer a query here instead of asking the server: for a practice
  // document's own page, which the server has never heard of. Return
  // undefined for arguments this does not answer.
  answer: (query: FunctionName, respond: Respond) => void;
  // The three everyday edits, for a query that returns a list of documents
  // (an array, or a page: `{ page: [...] }`).
  insert: (
    query: FunctionName,
    doc: Doc,
    options?: { at?: "start" | "end"; where?: (args: any) => boolean },
  ) => void;
  // Also patches a query whose result is that one document.
  patch: (query: FunctionName, id: string, fields: Doc) => void;
  remove: (query: FunctionName, id: string) => void;
};

// What one practised write does. Build with `practice(api.tasks.create, …)`.
export type SandboxEffect = {
  name: string;
  // Returns what the real mutation would have returned (an id, usually).
  run: (args: any, tools: SandboxTools) => unknown;
};

export type SandboxEvent = {
  // "practiced": a write the tutorial has an effect for.
  // "blocked": any other write. It was dropped.
  kind: "practiced" | "blocked";
  write: "mutation" | "action";
  name: string;
  args: unknown;
};

export type SandboxWrite =
  | { handled: true; value: unknown }
  // Not the sandbox's business: send it as usual.
  | { handled: false };

function idOf(doc: unknown): unknown {
  if (doc === null || typeof doc !== "object") return undefined;
  const record = doc as Doc;
  return record._id ?? record.id;
}

// Apply `change` to the list inside a query result, whichever shape it has.
function mapList(result: unknown, change: (list: unknown[]) => unknown[]): unknown {
  if (Array.isArray(result)) return change(result);
  if (result !== null && typeof result === "object" && Array.isArray((result as Doc).page)) {
    return { ...(result as Doc), page: change((result as Doc).page as unknown[]) };
  }
  return result;
}

export type SandboxOptions = {
  // Functions that are never sandboxed: sign-in, usage counts, recording a
  // finished tutorial. Given the "module:function" name.
  passthrough?: (name: string) => boolean;
};

export class Sandbox {
  private isActive = false;
  // Bumped on every change to the layer, so a watch can tell whether the
  // view it worked out last time still stands.
  private layerVersion = 0;
  private edits: { name: string; change: Change }[] = [];
  private answers: { name: string; respond: Respond }[] = [];
  private effects = new Map<string, SandboxEffect["run"]>();
  private allowed = new Set<string>();
  private counter = 0;
  private mintedIds = false;
  private me: SandboxTools["me"] = {};
  private readonly listeners = new Set<() => void>();
  private readonly eventListeners = new Set<(event: SandboxEvent) => void>();
  private readonly passthrough: (name: string) => boolean;

  constructor(options: SandboxOptions = {}) {
    this.passthrough = options.passthrough ?? (() => false);
  }

  get active(): boolean {
    return this.isActive;
  }

  get version(): number {
    return this.layerVersion;
  }

  // Whether any practice document was made this session. A page showing one
  // has nothing to show once the sandbox closes, so the tutorial leaves it.
  get madePracticeDocs(): boolean {
    return this.mintedIds;
  }

  // Start practising. `effects` are the writes the tutorial simulates,
  // `allow` the functions it vouches for as read-only (an action that only
  // fetches), and `setup` lays down anything the tutorial needs before the
  // first step.
  enter(
    options: {
      effects?: readonly SandboxEffect[];
      allow?: readonly FunctionName[];
      setup?: (tools: SandboxTools) => void;
      me?: SandboxTools["me"];
    } = {},
  ): void {
    this.reset();
    this.isActive = true;
    this.me = options.me ?? {};
    for (const effect of options.effects ?? []) this.effects.set(effect.name, effect.run);
    for (const fn of options.allow ?? []) this.allowed.add(functionName(fn));
    options.setup?.(this.tools());
    this.changed();
  }

  exit(): void {
    if (!this.isActive) return;
    this.reset();
    this.changed();
  }

  private reset(): void {
    this.isActive = false;
    this.edits = [];
    this.answers = [];
    this.effects = new Map();
    this.allowed = new Set();
    this.mintedIds = false;
  }

  // Called whenever the layer changes; every watched query re-reads.
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onEvent(listener: (event: SandboxEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  private changed(): void {
    this.layerVersion += 1;
    for (const listener of [...this.listeners]) listener();
  }

  // True when this query, with these arguments, must not be sent: it names
  // a practice document the server would reject as a malformed id.
  isLocal(args: unknown): boolean {
    return this.isActive && mentionsPractice(args);
  }

  // What a watched query shows: the server's result with the practice layer
  // over it. `base` reads the server's result and is not called for a query
  // answered here.
  view(name: string, args: unknown, base: () => unknown): unknown {
    if (!this.isActive) return base();
    let value: unknown;
    let answered = false;
    for (const answer of this.answers) {
      if (answer.name !== name) continue;
      const response = answer.respond(args);
      if (response !== undefined) {
        value = response;
        answered = true;
      }
    }
    if (!answered) value = mentionsPractice(args) ? undefined : base();
    // Still loading: there is nothing to edit yet. The edits stay in the
    // layer and apply when the result arrives.
    if (value === undefined) return undefined;
    for (const edit of this.edits) {
      if (edit.name !== name) continue;
      try {
        value = edit.change(value, args);
      } catch (error) {
        // An edit written for one shape of result met another. Showing the
        // real data is better than taking the page down mid-tutorial.
        console.warn(`[grove] tutorial edit of ${name} failed`, error);
      }
    }
    return value;
  }

  // A mutation or action the app is about to send.
  write(kind: "mutation" | "action", name: string, args: unknown): SandboxWrite {
    if (!this.isActive || this.passthrough(name) || this.allowed.has(name)) {
      return { handled: false };
    }
    const effect = this.effects.get(name);
    if (effect === undefined) {
      this.emit({ kind: "blocked", write: kind, name, args });
      return { handled: true, value: null };
    }
    let value: unknown = null;
    try {
      value = effect(args, this.tools()) ?? null;
    } catch (error) {
      console.warn(`[grove] tutorial effect for ${name} failed`, error);
    }
    this.changed();
    this.emit({ kind: "practiced", write: kind, name, args });
    return { handled: true, value };
  }

  private emit(event: SandboxEvent): void {
    for (const listener of [...this.eventListeners]) listener(event);
  }

  private tools(): SandboxTools {
    const id = (label = "doc") => {
      this.counter += 1;
      this.mintedIds = true;
      return `${PRACTICE_PREFIX}${label}-${this.counter}`;
    };
    const edit = (query: FunctionName, change: Change) => {
      this.edits.push({ name: functionName(query), change });
    };
    return {
      id,
      me: this.me,
      now: () => Date.now(),
      doc: (label, fields) => ({ ...fields, _id: id(label), _creationTime: Date.now() }),
      edit,
      answer: (query, respond) => {
        this.answers.push({ name: functionName(query), respond });
      },
      insert: (query, doc, options = {}) =>
        edit(query, (result, args) =>
          options.where !== undefined && !options.where(args)
            ? result
            : mapList(result, (list) => (options.at === "end" ? [...list, doc] : [doc, ...list])),
        ),
      patch: (query, target, fields) =>
        edit(query, (result) => {
          if (idOf(result) === target) return { ...(result as Doc), ...fields };
          return mapList(result, (list) =>
            list.map((doc) => (idOf(doc) === target ? { ...(doc as Doc), ...fields } : doc)),
          );
        }),
      remove: (query, target) =>
        edit(query, (result) => mapList(result, (list) => list.filter((doc) => idOf(doc) !== target))),
    };
  }
}
