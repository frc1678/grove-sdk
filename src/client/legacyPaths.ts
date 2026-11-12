// Old addresses keep working. An app that renames a page (or is itself moved
// to a new path under the Grove) lists what moved here, and
// `applyLegacyPaths` rewrites the address bar before the router reads it:
// no reload, no flash of a "not found" page, query string and hash kept.
//
// Patterns are app-relative (the part after the app's base), with `:name`
// for one segment and a trailing `/*` for the rest of the path:
//
//   applyLegacyPaths({
//     base: import.meta.env.BASE_URL,      // "/foundry/"
//     previousBases: ["/parts/"],          // the app's old address
//     paths: [
//       ["/", "/events"],                  // bare app address → main page
//       ["/e/:id/*", "/events/:id/*"],
//     ],
//   });
//
// Entries are tried in order and the first match wins. A path that matches
// nothing is left alone. Never remove an entry: printed QR codes, Slack
// messages and calendar feeds hold old links forever.

export type LegacyPath = readonly [from: string, to: string];

export type LegacyPathOptions = {
  // The app's base, as Vite gives it: import.meta.env.BASE_URL.
  base: string;
  // Bases the app was served at before, each like "/parts/".
  previousBases?: readonly string[];
  paths?: readonly LegacyPath[];
};

function trimBase(base: string): string {
  return `/${base.replace(/^\/+|\/+$/g, "")}`.replace(/^\/$/, "");
}

// Match `pattern` against an app-relative path; the params it captured, or
// null. "*" holds the rest of the path for a trailing "/*" (without the slash).
export function matchLegacyPattern(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split("/").filter((part) => part !== "");
  const pathParts = path.split("/").filter((part) => part !== "");
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const part = patternParts[i];
    if (part === "*" && i === patternParts.length - 1) {
      params["*"] = pathParts.slice(i).join("/");
      return params;
    }
    const value = pathParts[i];
    if (value === undefined) return null;
    if (part.startsWith(":")) {
      params[part.slice(1)] = value;
    } else if (part !== value) {
      return null;
    }
  }
  return pathParts.length === patternParts.length ? params : null;
}

function fillLegacyPattern(pattern: string, params: Record<string, string>): string {
  const filled = pattern
    .split("/")
    .map((part) => {
      if (part === "*") return params["*"] ?? "";
      if (part.startsWith(":")) return params[part.slice(1)] ?? "";
      return part;
    })
    .join("/")
    .replace(/\/+$/, "");
  return filled === "" ? "/" : filled;
}

// Where `pathname` (a full path, base included) should go, or null to stay.
export function legacyTarget(pathname: string, options: LegacyPathOptions): string | null {
  const base = trimBase(options.base);
  let rest: string | null = null;
  let moved = false;
  for (const candidate of [base, ...(options.previousBases ?? []).map(trimBase)]) {
    if (pathname === candidate || pathname.startsWith(`${candidate}/`) || candidate === "") {
      rest = pathname.slice(candidate.length) || "/";
      moved = candidate !== base;
      break;
    }
  }
  if (rest === null) return null;
  for (const [from, to] of options.paths ?? []) {
    const params = matchLegacyPattern(from, rest);
    if (params !== null) {
      rest = fillLegacyPattern(to, params);
      moved = true;
      break;
    }
  }
  if (!moved) return null;
  const target = `${base}${rest === "/" ? "/" : rest}`;
  return target === pathname ? null : target;
}

// Rewrite the address bar in place, before the router starts. Returns the
// new path, or null when nothing moved.
export function applyLegacyPaths(options: LegacyPathOptions): string | null {
  if (typeof window === "undefined") return null;
  const { pathname, search, hash } = window.location;
  const target = legacyTarget(pathname, options);
  if (target === null) return null;
  window.history.replaceState(window.history.state, "", `${target}${search}${hash}`);
  return target;
}
