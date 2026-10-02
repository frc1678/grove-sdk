// The last few things that went wrong in this tab, kept so a problem report
// can say what the page was complaining about when someone hit the button.
//
// Three sources: console.error, uncaught errors, and unhandled promise
// rejections. The first is the one that matters most and the least obvious:
// the Convex client reports a failed query or mutation through
// console.error rather than throwing into the page, so wrapping it is how a
// report carries "the last Convex function errors the client saw" without
// the SDK reaching into Convex's internals.
//
// Installed once per page, as early as the report module is imported, so
// errors from the very first render are in it. A second install is a no-op:
// wrapping console.error twice would record every error twice.

export type BufferedError = { at: number; message: string };

export const MAX_ERRORS = 20;
export const MAX_MESSAGE_LENGTH = 500;
const STACK_LINES = 3;

let buffer: BufferedError[] = [];
let installed = false;

export function installErrorBuffer(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const original = console.error;
  console.error = (...args: unknown[]) => {
    record(args.map(describe).join(" "));
    original.apply(console, args);
  };
  window.addEventListener("error", (event) => {
    record(event.error !== undefined && event.error !== null ? describe(event.error) : event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    record(`Unhandled rejection: ${describe(event.reason)}`);
  });
}

// Oldest first, as they happened.
export function recentErrors(): BufferedError[] {
  return buffer.slice();
}

function record(message: string): void {
  buffer.push({ at: Date.now(), message: message.slice(0, MAX_MESSAGE_LENGTH) });
  if (buffer.length > MAX_ERRORS) buffer = buffer.slice(-MAX_ERRORS);
}

// An Error reads as "Name: message" plus the top of its stack — enough to
// find the throwing line, without the fifty frames of React underneath it
// that would crowd everything else out of a 500-character entry.
export function describe(value: unknown): string {
  if (value instanceof Error) {
    const head = `${value.name}: ${value.message}`;
    const frames = (value.stack ?? "")
      .split("\n")
      .map((line) => line.trim())
      // V8 frames start "at ", Firefox and Safari frames are "fn@url:line".
      .filter((line) => line.startsWith("at ") || /@\S+:\d+/.test(line))
      .slice(0, STACK_LINES);
    return [head, ...frames].join("\n");
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    // Circular structures, BigInt: say what it was rather than lose the entry.
    return String(value);
  }
}

/** @internal For tests: forget what has been recorded. */
export function resetErrorBufferForTests(): void {
  buffer = [];
}
