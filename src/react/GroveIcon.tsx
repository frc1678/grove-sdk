import type { SVGProps } from "react";

// The Grove's mark: three trees on a ground line in the Citrus Circuits lime
// (#3cd52e, sampled from the team logo) on a dark tile, drawn on the same
// 24-unit grid and 2px stroke as the apps' Lucide icons. The canopies are
// filled so it still reads at 16px; the middle one's tile-coloured outline is
// what separates it from the two behind.
//
// Lives here so every app links back to the hub with the same mark instead
// of its own stand-in. The colors are deliberately literal rather than
// theme tokens: it is a brand mark and looks the same in light and dark.
// Keep it in step with the Grove's own `src/components/grove-icon.tsx` and
// `public/favicon.svg`.
export function GroveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" {...props}>
      <rect width="64" height="64" rx="14" fill="#1a1a1a" />
      <g
        transform="translate(8 8) scale(2)"
        fill="none"
        stroke="#3cd52e"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5.5 14v7M18.5 14v7" />
        <circle cx="5.5" cy="11.5" r="3.5" fill="#3cd52e" stroke="none" />
        <circle cx="18.5" cy="11.5" r="3.5" fill="#3cd52e" stroke="none" />
        <circle cx="12" cy="8" r="5.6" fill="#3cd52e" stroke="#1a1a1a" strokeWidth="1.5" />
        <path d="M12 13v8M2 21h20" />
      </g>
    </svg>
  );
}
