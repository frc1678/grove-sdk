import type { SVGProps } from "react";

// The Grove's mark: a fruit tree in the Citrus Circuits lime (#3cd52e,
// sampled from the team logo). Three canopy circles, a trunk, and three
// fruit, so it still reads at favicon size.
//
// Lives here so every app links back to the hub with the same mark instead
// of its own stand-in. The colors are deliberately literal rather than
// theme tokens: it is a brand mark and looks the same in light and dark.
// Keep it in step with the Grove's own `src/components/grove-icon.tsx` and
// `public/favicon.svg`.
export function GroveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" {...props}>
      <path fill="#8a5a34" d="M14.3 14h3.4v13.2a1.7 1.7 0 0 1-3.4 0z" />
      <g fill="#3cd52e">
        <circle cx="16" cy="11" r="8.4" />
        <circle cx="9" cy="14.6" r="5.6" />
        <circle cx="23" cy="14.6" r="5.6" />
      </g>
      <g fill="#158f0c">
        <circle cx="10.8" cy="10.4" r="1.7" />
        <circle cx="20.9" cy="9.4" r="1.7" />
        <circle cx="16.4" cy="15.6" r="1.7" />
      </g>
    </svg>
  );
}
