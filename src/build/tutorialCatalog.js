// The tutorials a Grove app offers, as the Grove sees them.
//
// An app's tutorials are written in two files. src/tutorial-catalog.ts is
// this list: each tutorial's id, name, one-line summary and what it is
// worth. src/tutorials.tsx holds the steps, keyed by the same ids. They are
// apart because the build writes the catalog to grove-tutorials.json beside
// index.html, where the Grove reads it at /<slug>/grove-tutorials.json to
// draw its Tutorials page and to know how many points finishing one earns.
// The steps are React and never leave the app.
//
// Used from vite.config.ts:
//
//   import { groveTutorials } from "@frc1678/grove-sdk/build"
//   import catalog from "./src/tutorial-catalog.ts"
//
//   export default defineConfig({
//     plugins: [react(), tailwindcss(), groveTutorials(catalog)],
//   })
//
// src/tutorial-catalog.ts imports defineTutorialCatalog from
// "@frc1678/grove-sdk/tutorial-catalog", which is this file alone: the
// /build entry pulls in git and the filesystem, and the catalog is also
// imported by the browser.
//
// Plain JavaScript on purpose: Node loads this file directly from
// node_modules, and refuses to strip types from anything under there.

export const TUTORIALS_FILE = "grove-tutorials.json";
export const TUTORIALS_VERSION = 1;
export const TUTORIAL_ROLES = ["student", "lead", "coach", "admin"];
export const MAX_TUTORIALS = 12;
export const MIN_POINTS = 5;
export const MAX_POINTS = 50;
export const MAX_MINUTES = 30;
export const TUTORIAL_ID = /^[a-z][a-z0-9-]{0,39}$/;

const FIELDS = new Set(["id", "title", "summary", "points", "minutes", "minRole", "groups"]);
export const MAX_GROUPS = 5;

/** Identity, typed, so src/tutorial-catalog.ts gets autocompletion. */
export function defineTutorialCatalog(tutorials) {
  return tutorials;
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
 * Checks a catalog against the rules the Grove's parser enforces. Returns
 * the tutorials trimmed and with minRole filled in, or every problem found.
 */
export function validateTutorialCatalog(tutorials) {
  if (!Array.isArray(tutorials)) return { errors: ["tutorials must be an array"] };
  const errors = [];
  if (tutorials.length > MAX_TUTORIALS) {
    errors.push(`at most ${MAX_TUTORIALS} tutorials, got ${tutorials.length}`);
  }
  const seen = new Set();
  const normalized = tutorials.map((tutorial, i) => {
    const problems = [];
    const out = {};
    if (tutorial === null || typeof tutorial !== "object" || Array.isArray(tutorial)) {
      problems.push("must be an object");
    } else {
      for (const key of Object.keys(tutorial)) {
        if (!FIELDS.has(key)) problems.push(`unknown field "${key}"`);
      }

      if (typeof tutorial.id !== "string" || !TUTORIAL_ID.test(tutorial.id)) {
        problems.push("id must be lowercase letters, digits and dashes, starting with a letter");
      } else if (seen.has(tutorial.id)) {
        problems.push("id is already used by an earlier tutorial");
      } else {
        seen.add(tutorial.id);
      }
      out.id = tutorial.id;

      const title = text(tutorial.title, "title", 60);
      if (title.problem) problems.push(title.problem);
      out.title = title.value;

      const summary = text(tutorial.summary, "summary", 200);
      if (summary.problem) problems.push(summary.problem);
      out.summary = summary.value;

      if (
        !Number.isInteger(tutorial.points) ||
        tutorial.points < MIN_POINTS ||
        tutorial.points > MAX_POINTS
      ) {
        problems.push(`points must be a whole number from ${MIN_POINTS} to ${MAX_POINTS}`);
      }
      out.points = tutorial.points;

      if (tutorial.minutes !== undefined) {
        if (
          !Number.isInteger(tutorial.minutes) ||
          tutorial.minutes < 1 ||
          tutorial.minutes > MAX_MINUTES
        ) {
          problems.push(`minutes must be a whole number from 1 to ${MAX_MINUTES}`);
        }
        out.minutes = tutorial.minutes;
      }

      const minRole = tutorial.minRole ?? "student";
      if (!TUTORIAL_ROLES.includes(minRole)) {
        problems.push(`minRole must be one of ${TUTORIAL_ROLES.join(", ")}`);
      }
      out.minRole = minRole;

      // Grove groups ("Outreach Leads") offered it whatever their role: for
      // access an app grants by group rather than by role. The Grove drops a
      // name it does not know; see GET /api/v1/groups.
      if (tutorial.groups !== undefined) {
        if (
          !Array.isArray(tutorial.groups) ||
          tutorial.groups.length === 0 ||
          tutorial.groups.length > MAX_GROUPS ||
          !tutorial.groups.every((group) => typeof group === "string" && group.trim() !== "" && group.length <= 40)
        ) {
          problems.push(`groups must be 1–${MAX_GROUPS} group names`);
        } else {
          out.groups = tutorial.groups.map((group) => group.trim());
        }
      }
    }
    const label = typeof tutorial?.id === "string" ? `${i + 1} (${tutorial.id})` : `${i + 1}`;
    for (const problem of problems) errors.push(`tutorial ${label}: ${problem}`);
    return out;
  });
  return errors.length > 0 ? { errors } : { tutorials: normalized };
}

/** The file's text, or a thrown error listing every problem. */
export function tutorialCatalogJson(tutorials) {
  const result = validateTutorialCatalog(tutorials);
  if (result.errors) {
    throw new Error(
      `[grove] groveTutorials(): ${TUTORIALS_FILE} has ${result.errors.length} problem(s):\n` +
        result.errors.map((error) => `  - ${error}`).join("\n"),
    );
  }
  return `${JSON.stringify({ version: TUTORIALS_VERSION, tutorials: result.tutorials }, null, 2)}\n`;
}

export function groveTutorials(tutorials) {
  // Checked when vite.config.ts loads, so `vite dev` refuses a bad catalog
  // as loudly as `vite build` does.
  const body = tutorialCatalogJson(tutorials);
  let base = "/";

  return {
    name: "grove-tutorials",
    configResolved(config) {
      base = config.base.endsWith("/") ? config.base : `${config.base}/`;
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: TUTORIALS_FILE, source: body });
    },
    // So a local Grove can read the catalog from a running app.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? "").split("?")[0] !== `${base}${TUTORIALS_FILE}`) return next();
        res.setHeader("Content-Type", "application/json");
        res.end(body);
      });
    },
  };
}
