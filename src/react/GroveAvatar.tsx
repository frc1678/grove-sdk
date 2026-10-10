import { useEffect, useState } from "react";

// A person's photo (their Slack profile photo, from the roster mirror's
// `picture` or the live roster's `slackImage`), or their initials when there
// is none or the link has gone stale — Slack retires an old URL when someone
// changes their photo, and the Grove's daily sync catches up.
//
// The name beside it stays the label everywhere, so the image is decorative
// to a screen reader. The Grove draws the same thing in
// src/components/person-avatar.tsx; keep the two looking alike.
//
// Sizes: "xs" 20px inside a badge or chip, "sm" 24px for table rows and
// inline mentions, "md" 32px for lists,
// "lg" 40px, and "xl" 56px for face grids where recognising someone is the
// point (attendance, who is in the shop).
export type GroveAvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZES: Record<GroveAvatarSize, string> = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
  xl: "size-14 text-base",
};

export function GroveAvatar({
  name,
  src,
  size = "md",
  className = "",
}: {
  name: string;
  src?: string;
  size?: GroveAvatarSize;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  // A new URL (the next sync's) deserves another try.
  useEffect(() => setFailed(false), [src]);
  const showImage = src !== undefined && src !== "" && !failed;
  return (
    <span
      aria-hidden="true"
      data-slot="grove-avatar"
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-medium text-muted-foreground ring-1 ring-border ring-inset select-none ${SIZES[size]} ${className}`}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}

// Up to two letters: first and last word, so "Ada Whitfield" is AW.
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}
