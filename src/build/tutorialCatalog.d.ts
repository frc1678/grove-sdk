import type { Plugin } from "vite";

export type TutorialRole = "student" | "lead" | "coach" | "admin";

/** One tutorial, as the Grove lists it. The steps live in src/tutorials.tsx. */
export type TutorialCatalogEntry = {
  /** Lowercase letters, digits and dashes. Never reuse or rename one: completions are kept by it. */
  id: string;
  /** What the person will have done: "RSVP to a meeting". 1–60 characters. */
  title: string;
  /** One plain sentence, 1–200 characters. */
  summary: string;
  /** Achievement points for finishing it, 5–50. About 5 a minute. */
  points: number;
  /** Roughly how long it takes, 1–30. */
  minutes?: number;
  /** Who it is offered to. Defaults to "student". */
  minRole?: TutorialRole;
};

/** The contents of grove-tutorials.json. */
export type TutorialCatalog = {
  version: 1;
  tutorials: Array<TutorialCatalogEntry & { minRole: TutorialRole }>;
};

export declare const TUTORIALS_FILE: "grove-tutorials.json";
export declare const TUTORIALS_VERSION: 1;
export declare const TUTORIAL_ROLES: readonly TutorialRole[];
export declare const MAX_TUTORIALS: number;
export declare const MIN_POINTS: number;
export declare const MAX_POINTS: number;
export declare const MAX_MINUTES: number;
export declare const TUTORIAL_ID: RegExp;

/** Identity, typed for autocompletion in src/tutorial-catalog.ts. */
export declare function defineTutorialCatalog<const T extends readonly TutorialCatalogEntry[]>(
  tutorials: T,
): T;
/** The tutorials trimmed and with minRole filled in, or every problem found. */
export declare function validateTutorialCatalog(
  tutorials: unknown,
):
  | { tutorials: TutorialCatalog["tutorials"]; errors?: undefined }
  | { errors: string[]; tutorials?: undefined };
/** The file's text. Throws, listing every problem, on a bad catalog. */
export declare function tutorialCatalogJson(tutorials: unknown): string;
/** Emits grove-tutorials.json with the build and serves it from the dev server. Throws on a bad entry. */
export declare function groveTutorials(tutorials: readonly TutorialCatalogEntry[]): Plugin;
