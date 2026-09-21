// The arithmetic behind a Grove app's Vxx.yy version, kept clear of
// node:child_process so the tests can run in vitest's edge-runtime
// environment alongside the rest of the SDK.

export type GroveVersion = {
  // The app's TUTORIAL_VERSION. It moves when a functional change forces the
  // tutorial to change, which is also when everyone is shown it again.
  major: number;
  // Commits on main since the major last moved.
  minor: number;
  // "V03.07" — what people actually see.
  label: string;
};

/**
 * Two digits each, and no cap on the minor: V03.07, and V03.104 after a
 * hundred merges without a tutorial change. Padding the major keeps the
 * label the same width for the first ninety-nine of them, so it does not
 * reflow the header it sits in.
 */
export function formatGroveVersion(major: number, minor: number): string {
  return `V${pad(major)}.${pad(minor)}`;
}

function pad(value: number): string {
  return String(Math.max(0, Math.trunc(value))).padStart(2, "0");
}

/**
 * `git rev-list --count` output to a number. Anything unexpected — an empty
 * string from a repository with no history, a git error already swallowed
 * upstream — is 0 rather than NaN, because NaN reaches the header as
 * "VNaN" and a wrong-but-plausible 00 is easier to notice and explain.
 */
export function parseCommitCount(raw: string | null): number {
  if (raw === null) return 0;
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
