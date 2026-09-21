import { execFileSync } from "node:child_process";
import { formatGroveVersion, parseCommitCount } from "./versionFormat.js";

export { formatGroveVersion };

// A Grove app's version is Vxx.yy, and neither half is typed by hand twice.
//
//   xx  the app's TUTORIAL_VERSION, which lives alone in src/version.ts.
//       Bumping it re-shows the tutorial to everyone who dismissed the old
//       one, so it already moves exactly when a functional change forces
//       the tutorial to change. That is the major.
//
//   yy  commits on main since src/version.ts last changed. Because that
//       file holds the major and nothing else, "last commit that touched
//       it" is exactly "last time the major moved" — no diff to parse, no
//       counter to remember, and a merge that changes nothing else still
//       moves the version.
//
// Used from vite.config.ts:
//
//   import { groveVersionDefine } from "@frc1678/grove-sdk/build"
//   import { APP_MAJOR } from "./src/version.ts"
//
//   export default defineConfig({
//     define: groveVersionDefine({ major: APP_MAJOR }),
//   })
//
// Two rules that are easy to get wrong:
//
//   - src/version.ts must hold the constant and nothing else. It is
//     imported at config time, where a browser global would not exist.
//   - If the app already has a `define`, spread this into it. Two `define`
//     keys in one object literal is legal JS and the last silently wins.
//
// Plain JavaScript on purpose: Node loads this file directly from
// node_modules, and refuses to strip types from anything under there.

export const MAJOR_FILE = "src/version.ts";

function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Resolve the version to show. Never throws: a build that cannot reach git
 * still produces a label, because failing a deploy over a cosmetic badge
 * would be a poor trade.
 *
 * It does warn, loudly, in the one case that produces a plausible-looking
 * lie: a shallow clone. `actions/checkout` fetches depth 1 by default, and
 * there every commit count is 0, so every build would call itself Vxx.00
 * while looking perfectly healthy. Every Grove workflow that runs
 * `bun run build` sets `fetch-depth: 0` for this reason.
 */
export function resolveGroveVersion({ major, cwd = process.cwd(), majorFile = MAJOR_FILE }) {
  if (git(["rev-parse", "--is-shallow-repository"], cwd) === "true") {
    console.warn(
      `[grove] shallow clone: the ${MAJOR_FILE} history needed for the version's minor is not here, ` +
        `so this build is labelled ${formatGroveVersion(major, 0)}. Set fetch-depth: 0 on actions/checkout.`,
    );
  }

  const bumped = git(["log", "-1", "--format=%H", "--", majorFile], cwd);
  const minor =
    bumped === null || bumped === ""
      ? 0
      : parseCommitCount(git(["rev-list", "--count", `${bumped}..HEAD`], cwd));

  return { major, minor, label: formatGroveVersion(major, minor) };
}

/**
 * The same thing shaped for Vite's `define`. The constant is replaced in
 * app source at build time, so src/app-version.ts can read it with no
 * runtime cost and no network call.
 */
export function groveVersionDefine(options) {
  return {
    __GROVE_APP_VERSION__: JSON.stringify(resolveGroveVersion(options).label),
  };
}
