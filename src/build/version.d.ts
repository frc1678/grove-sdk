import type { GroveVersion } from "./versionFormat.js";

export type { GroveVersion };

export type ResolveOptions = {
  /** The app's APP_MAJOR, from src/version.ts. */
  major: number;
  /** Repository root. Defaults to the directory vite was started in. */
  cwd?: string;
  /** Path, relative to cwd, of the file holding nothing but the major. */
  majorFile?: string;
};

export declare const MAJOR_FILE: string;
export declare function formatGroveVersion(major: number, minor: number): string;
export declare function resolveGroveVersion(options: ResolveOptions): GroveVersion;
/** Spread this into an existing `define` — a second key silently wins. */
export declare function groveVersionDefine(options: ResolveOptions): Record<string, string>;
