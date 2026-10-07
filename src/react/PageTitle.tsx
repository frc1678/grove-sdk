import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

// While the nav is folded into the menu, the app bar has room for the
// page's name, so a page's title goes there, centred, instead of taking a
// row of its own. Once the nav is inline the title is the page's own
// heading again. GroveShell provides the spot and says from which width.

export type NavBreakpoint = "md" | "lg" | "xl";

export const PageTitleSlot = createContext<{ node: HTMLElement | null; from: NavBreakpoint }>({
  node: null,
  from: "xl",
});

// Literal class names, so Tailwind finds them in this file.
const SHOWN_FROM: Record<NavBreakpoint, string> = {
  md: "sr-only md:not-sr-only",
  lg: "sr-only lg:not-sr-only",
  xl: "sr-only xl:not-sr-only",
};

/**
 * The page's title: its h1 (read by screen readers at every width, shown
 * once the nav is inline) and, below that, the same words in the app bar.
 * Outside a GroveShell it is a plain, visible h1.
 */
export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  const { node, from } = useContext(PageTitleSlot);
  const visibility = node === null ? "" : SHOWN_FROM[from];
  return (
    <>
      <h1 className={`${visibility} text-xl font-semibold tracking-tight ${className ?? ""}`}>{children}</h1>
      {node !== null &&
        createPortal(
          <span data-page-title className="block truncate">
            {children}
          </span>,
          node,
        )}
    </>
  );
}

/**
 * A page's title, one line on what it is for, and its buttons. The
 * description is for a screen with room: a phone goes straight to the
 * buttons, and with no buttons the header takes no space at all there.
 * Keep the description to a sentence; anything longer belongs in the
 * tutorial.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    // With no buttons there is nothing to show on a phone; taking it out of
    // the flow (still read aloud) keeps the page's gap from opening above
    // the content for an empty row.
    <div
      className={`flex flex-wrap items-end justify-between gap-x-3 gap-y-2 ${actions === undefined ? "max-sm:sr-only" : ""}`}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
        <PageTitle>{title}</PageTitle>
        {description !== undefined && (
          <p className="hidden max-w-4xl text-sm text-muted-foreground sm:block">{description}</p>
        )}
      </div>
      {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
