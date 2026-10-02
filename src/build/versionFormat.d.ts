export type GroveVersion = {
  /** The app's TUTORIAL_VERSION: moves when a functional change forces the
   *  tutorial to change, which is also when everyone is shown it again. */
  major: number;
  /** Commits on main since the major last moved. */
  minor: number;
  /** "V03.07" — what people actually see. */
  label: string;
};

export function formatGroveVersion(major: number, minor: number): string;
export function parseCommitCount(raw: string | null): number;
