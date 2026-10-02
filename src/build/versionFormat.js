// The arithmetic behind a Grove app's Vxx.yy version.
//
// Plain JavaScript, with types in the sibling .d.ts, and that is not a
// style slip. This module and its sibling are loaded by Node directly,
// from an app's vite.config.ts — and Node refuses to strip types from any
// file under node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING),
// so a .ts here fails every consuming app's `vite build` while passing
// the SDK's own typecheck. Everything else in the SDK is TypeScript
// source, because everything else is bundled by the app's Vite rather
// than loaded by Node.

/**
 * Two digits each, and no cap on the minor: V03.07, and V03.104 after a
 * hundred merges without a tutorial change. Padding the major keeps the
 * label the same width for the first ninety-nine of them, so it does not
 * reflow the header it sits in.
 */
export function formatGroveVersion(major, minor) {
  return `V${pad(major)}.${pad(minor)}`;
}

function pad(value) {
  return String(Math.max(0, Math.trunc(value))).padStart(2, "0");
}

/**
 * `git rev-list --count` output to a number. Anything unexpected — an
 * empty string from a repository with no history, a git error already
 * swallowed upstream — is 0 rather than NaN, because NaN reaches the
 * header as "VNaN" and a wrong-but-plausible 00 is easier to explain.
 */
export function parseCommitCount(raw) {
  if (raw === null) return 0;
  const parsed = Number.parseInt(String(raw).trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
