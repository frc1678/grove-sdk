import type { Plugin } from "vite";

export type GroveIndexRole = "student" | "lead" | "coach" | "admin";

/** One page in an app's search index. */
export type GroveIndexEntry = {
  /** Path as the app's router sees it, without /<slug>: "/request", "/orders?tab=open". */
  path: string;
  /** 1–60 characters. */
  title: string;
  /** One plain sentence saying what someone does there, 1–200 characters. */
  summary: string;
  /** Up to 12 other words people would search for, 1–40 characters each. */
  keywords?: string[];
  /** Who the result is shown to in search. Defaults to "student"; the app still enforces access. */
  minRole?: GroveIndexRole;
};

/** The contents of grove-index.json. */
export type GroveIndex = {
  version: 1;
  entries: Array<GroveIndexEntry & { minRole: GroveIndexRole }>;
};

export declare const INDEX_FILE: "grove-index.json";
export declare const INDEX_VERSION: 1;
export declare const ROLES: readonly GroveIndexRole[];
export declare const MAX_ENTRIES: number;
export declare const MAX_KEYWORDS: number;

/** Identity, typed for autocompletion in src/grove-index.ts. */
export declare function defineGroveIndex(entries: GroveIndexEntry[]): GroveIndexEntry[];
/** The entries trimmed and with minRole filled in, or every problem found. */
export declare function validateGroveIndex(
  entries: unknown,
): { entries: GroveIndex["entries"]; errors?: undefined } | { errors: string[]; entries?: undefined };
/** Emits grove-index.json with the build and serves it from the dev server. Throws on a bad entry. */
export declare function groveIndex(entries: readonly GroveIndexEntry[]): Plugin;
