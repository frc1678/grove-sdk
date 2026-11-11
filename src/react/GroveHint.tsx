import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// A small "what does this mean?" button that opens on a tap. Use it where a
// `title` tooltip would have gone: a tooltip only shows on hover, and a phone
// never hovers (grove/hover-only-hint in the lint plugin flags those).
//
//   Required <GroveHint label="What does Required mean?">Your subteam needs
//   you at this meeting.</GroveHint>
//
// Prefer plain visible text when there is room. This is for the cases where
// the explanation is longer than the space beside the word.
export function GroveHint({
  label,
  children,
  className,
}: {
  /** What the button is for, said by a screen reader: "What does Banked mean?" */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (wrap.current !== null && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <span ref={wrap} className={className ?? "relative inline-flex align-middle"}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
        // The circle is 20px; the ::after grows the tap area to 40px.
        className="relative inline-flex size-5 items-center justify-center rounded-full border border-current/40 text-[0.6875rem] leading-none font-semibold text-muted-foreground after:absolute after:-inset-2.5 hover:text-foreground"
      >
        <span aria-hidden="true">?</span>
      </button>
      {open && (
        <span
          id={panelId}
          role="note"
          className="absolute top-full left-1/2 z-50 mt-1.5 w-56 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border bg-popover p-2.5 text-left text-sm leading-snug font-normal text-popover-foreground shadow-md"
        >
          {children}
        </span>
      )}
    </span>
  );
}
