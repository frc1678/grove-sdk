// The pages a Grove app offers to the Grove's team-wide search.
//
// Each app lists the pages people actually go to, in the words a new member
// would type, and the build writes them to grove-index.json next to
// index.html, so the Grove reads it at /<slug>/grove-index.json. The Grove
// re-reads every app's file daily, when the app is saved in Admin → Apps,
// and on Refresh, and searches across all of them.
//
// Used from vite.config.ts:
//
//   import { groveIndex } from "@frc1678/grove-sdk/build"
//   import entries from "./src/grove-index.ts"
//
//   export default defineConfig({
//     plugins: [react(), tailwindcss(), groveIndex(entries)],
//   })
//
// The entries are checked here against the same rules the Grove's parser
// enforces, and a bad one stops the build. The Grove drops a file it cannot
// parse, so a mistake that shipped would quietly take the whole app out of
// search.
//
// src/grove-index.ts imports defineGroveIndex from
// "@frc1678/grove-sdk/search-index", which is this file alone. The /build
// entry also pulls in git and the filesystem, so an app's nav that imported
// its entries through /build would drag Node modules into the browser.
//
// Plain JavaScript on purpose: Node loads this file directly from
// node_modules, and refuses to strip types from anything under there.

export const INDEX_FILE = "grove-index.json";
export const INDEX_VERSION = 1;
export const ROLES = ["student", "lead", "coach", "admin"];
export const MAX_ENTRIES = 60;
export const MAX_KEYWORDS = 12;

const FIELDS = new Set(["path", "title", "summary", "keywords", "minRole"]);

/** Identity, typed, so src/grove-index.ts gets autocompletion. */
export function defineGroveIndex(entries) {
  return entries;
}

function pathProblem(path) {
  if (typeof path !== "string") return "path is required and must be a string";
  if (!path.startsWith("/")) return 'path must start with "/"';
  if (path.startsWith("//")) return 'path must not start with "//"';
  if (path.length > 200) return "path must be at most 200 characters";
  if (path.includes("\\")) return "path must not contain a backslash";
  if (/\s/.test(path)) return "path must not contain whitespace";
  if (path.includes("://")) return 'path must not contain "://"';
  return undefined;
}

function text(value, name, max) {
  if (typeof value !== "string") return { problem: `${name} is required and must be a string` };
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > max) {
    return { problem: `${name} must be 1–${max} characters once trimmed` };
  }
  return { value: trimmed };
}

/**
 * Checks entries against the index's rules. Returns the entries trimmed and
 * with minRole filled in, or every problem found, each naming its entry.
 */
export function validateGroveIndex(entries) {
  if (!Array.isArray(entries)) return { errors: ["entries must be an array"] };
  const errors = [];
  if (entries.length > MAX_ENTRIES) {
    errors.push(`at most ${MAX_ENTRIES} entries, got ${entries.length}`);
  }
  const seen = new Set();
  const normalized = entries.map((entry, i) => {
    const problems = [];
    const out = {};
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push("must be an object");
    } else {
      // A misspelt key would otherwise be dropped: "minrole" would leave a
      // coach-only page offered to students.
      for (const key of Object.keys(entry)) {
        if (!FIELDS.has(key)) problems.push(`unknown field "${key}"`);
      }

      const pathError = pathProblem(entry.path);
      if (pathError) problems.push(pathError);
      else if (seen.has(entry.path)) problems.push("path is already used by an earlier entry");
      else seen.add(entry.path);
      out.path = entry.path;

      const title = text(entry.title, "title", 60);
      if (title.problem) problems.push(title.problem);
      out.title = title.value;

      const summary = text(entry.summary, "summary", 200);
      if (summary.problem) problems.push(summary.problem);
      out.summary = summary.value;

      if (entry.keywords !== undefined) {
        if (!Array.isArray(entry.keywords)) {
          problems.push("keywords must be an array of strings");
        } else {
          if (entry.keywords.length > MAX_KEYWORDS) {
            problems.push(`at most ${MAX_KEYWORDS} keywords, got ${entry.keywords.length}`);
          }
          out.keywords = entry.keywords.map((keyword, k) => {
            const checked = text(keyword, `keywords[${k}]`, 40);
            if (checked.problem) problems.push(checked.problem);
            return checked.value;
          });
        }
      }

      const minRole = entry.minRole ?? "student";
      if (!ROLES.includes(minRole)) problems.push(`minRole must be one of ${ROLES.join(", ")}`);
      out.minRole = minRole;
    }
    const label = typeof entry?.path === "string" ? `${i + 1} (${entry.path})` : `${i + 1}`;
    for (const problem of problems) errors.push(`entry ${label}: ${problem}`);
    return out;
  });
  return errors.length > 0 ? { errors } : { entries: normalized };
}

/** The file's text, or a thrown error listing every problem. */
function groveIndexJson(entries) {
  const result = validateGroveIndex(entries);
  if (result.errors) {
    throw new Error(
      `[grove] groveIndex(): ${INDEX_FILE} has ${result.errors.length} problem(s):\n` +
        result.errors.map((error) => `  - ${error}`).join("\n"),
    );
  }
  return `${JSON.stringify({ version: INDEX_VERSION, entries: result.entries }, null, 2)}\n`;
}

export function groveIndex(entries) {
  // Checked when vite.config.ts loads, so `vite dev` refuses a bad index as
  // loudly as `vite build` does.
  const body = groveIndexJson(entries);
  let base = "/";

  return {
    name: "grove-index",
    configResolved(config) {
      base = config.base.endsWith("/") ? config.base : `${config.base}/`;
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: INDEX_FILE, source: body });
    },
    // So a local Grove can read the index from a running app.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? "").split("?")[0] !== `${base}${INDEX_FILE}`) return next();
        res.setHeader("Content-Type", "application/json");
        res.end(body);
      });
    },
  };
}
