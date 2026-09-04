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

// Whether the tutorial opens itself. Split out from the component because
// the three ways to get this wrong are all here:
//
//  - `seenVersion === undefined` is the query still loading. Opening then
//    and closing when the answer arrives is the flash this avoids.
//  - a pending or archived account is looking at the holding page, not the
//    app, so it is never handed a tutorial.
//  - an app with no slides has no tutorial, whatever its version says.
export function shouldAutoOpen(input: {
  seenVersion: number | null | undefined;
  version: number;
  status: string | undefined;
  slideCount: number;
}): boolean {
  if (input.slideCount === 0) return false;
  if (input.status !== "active") return false;
  if (input.seenVersion === undefined) return false;
  return (input.seenVersion ?? 0) < input.version;
}
