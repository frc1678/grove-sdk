import type { ReactNode } from "react";

// One screen of an app's tutorial. Text, an icon, a simple diagram — no
// screenshots or GIFs: they go stale the first time the app is restyled and
// nobody notices for a season.
export type TutorialSlide = {
  title: string;
  body: ReactNode;
  // Optional mark for the slide. Anything that renders: an SVG, a lucide
  // icon, a small hand-drawn diagram.
  icon?: ReactNode;
};

// What changed in one major version, for people who already know the app.
// Keyed by the same number as the tutorial — the app's APP_MAJOR — so the
// entry for 4 is what someone who last dismissed version 3 is shown.
export type ChangelogEntry = {
  version: number;
  // Optional one-line headline for the release, shown beside its version.
  title?: string;
  // One item per change, a sentence or two each. Same rule as the slides:
  // text and icons, no screenshots.
  changes: ReactNode[];
};

// The entries someone who last dismissed `seenVersion` has not been shown,
// newest first. An entry for a version the build has not reached yet — one
// written ahead of the bump that ships it — stays hidden until it does.
export function unseenChanges(
  changelog: readonly ChangelogEntry[],
  seenVersion: number,
  version: number,
): ChangelogEntry[] {
  return changelog
    .filter((entry) => entry.version > seenVersion && entry.version <= version)
    .sort((a, b) => b.version - a.version);
}

// Which dialog opens itself, if any. Split out from the component because
// the ways to get this wrong are all here:
//
//  - `seenVersion === undefined` is the query still loading. Opening then
//    and closing when the answer arrives is the flash this avoids.
//  - a pending or archived account is looking at the holding page, not the
//    app, so it is never handed either dialog.
//  - only someone who has never dismissed any version gets the tutorial.
//    A returning person on an older version already knows the app; walking
//    them through it again from slide one is what taught people to hit Skip
//    without reading. They get what changed instead.
//  - a bump with no changelog entry behind it opens nothing, rather than
//    falling back to the tutorial — that fallback is exactly the re-showing
//    this replaced.
export function autoOpening(input: {
  seenVersion: number | null | undefined;
  version: number;
  status: string | undefined;
  slideCount: number;
  changelog: readonly ChangelogEntry[];
}): "tutorial" | "changelog" | null {
  if (input.status !== "active") return null;
  if (input.seenVersion === undefined) return null;
  if (input.seenVersion === null) return input.slideCount > 0 ? "tutorial" : null;
  if (input.seenVersion >= input.version) return null;
  return unseenChanges(input.changelog, input.seenVersion, input.version).length > 0
    ? "changelog"
    : null;
}
