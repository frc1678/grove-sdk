// The app's version, shown in the header. Subtle enough to ignore while
// you work, and in the same place in every Grove app so that "what version
// are you on?" has an answer someone can read out over a loud field.
//
// The string comes from the app — src/app-version.ts, which reads the
// constant vite.config.ts injects — rather than from a global read here.
// Vite's `define` reliably rewrites app source; whether it reaches a
// linked dependency depends on how that dependency was bundled, and a
// badge that quietly renders nothing in dev is worse than no badge.

export function GroveVersionBadge({
  version,
  className,
}: {
  // "V03.07". Whatever src/app-version.ts exports.
  version: string;
  className?: string;
}) {
  if (version === "") return null;

  return (
    <span
      // tabular-nums stops the digits from changing width as the minor
      // ticks up, which would nudge everything beside it on each deploy.
      className={
        className ??
        "shrink-0 select-none font-mono text-[0.6875rem] leading-none tabular-nums text-muted-foreground/70"
      }
      title={`Version ${version} — the first half moves when the tutorial changes, the second with every merge.`}
    >
      {version}
    </span>
  );
}
