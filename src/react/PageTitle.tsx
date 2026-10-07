import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

// While the nav is folded into the menu, the app bar has room for the
// page's name, so a page's title goes there, centred, instead of taking a
// row of its own. Once the nav is inline the highlighted tab already says
// where you are, so a title that only repeats it is not shown again; a
// title the tab cannot say — a part's number, a location's name — is the
// page's heading. GroveShell provides the spot, the width, and the tab.

export type NavBreakpoint = "md" | "lg" | "xl";

export const PageTitleSlot = createContext<{
  node: HTMLElement | null;
  from: NavBreakpoint;
  // The highlighted nav item's label.
  section?: string;
}>({ node: null, from: "xl" });

// Literal class names, so Tailwind finds them in this file.
const SHOWN_FROM: Record<NavBreakpoint, string> = {
  md: "sr-only md:not-sr-only",
  lg: "sr-only lg:not-sr-only",
  xl: "sr-only xl:not-sr-only",
};
const GONE_BELOW: Record<NavBreakpoint, string> = {
  md: "max-md:sr-only",
  lg: "max-lg:sr-only",
  xl: "max-xl:sr-only",
};

// Whether the title says nothing the header does not: it is the
// highlighted tab's own name.
function useRepeatsTab(title: ReactNode): boolean {
  const { node, section } = useContext(PageTitleSlot);
  return node !== null && typeof title === "string" && title === section;
}

/**
 * The page's title: its h1 (read by screen readers at every width) and,
 * below the nav breakpoint, the same words in the app bar. Shown on the
 * page from the breakpoint unless it only repeats the highlighted tab.
 * Outside a GroveShell it is a plain, visible h1.
 */
export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  const { node, from } = useContext(PageTitleSlot);
  const repeats = useRepeatsTab(children);
  const visibility = node === null ? "" : repeats ? "sr-only" : SHOWN_FROM[from];
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
 * A page's title, a line of facts about it, and its buttons — no
 * paragraph explaining the page; that is the tutorial's job. With nothing
 * to show at a width (the title is in the app bar or repeats the tab, and
 * there is no subtitle or button) it takes no room at all.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  // Facts about this one thing, shown at every width: "Issued by Ava on
  // Oct 3", a location's own note. Not a description of the page.
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const { node, from } = useContext(PageTitleSlot);
  const repeats = useRepeatsTab(title);
  const bare = subtitle === undefined && actions === undefined;
  // Taken out of the flow (still read aloud) when empty, so the page's gap
  // does not open above the content for an empty row.
  const gone = node === null || !bare ? "" : repeats ? "sr-only" : GONE_BELOW[from];
  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-3 gap-y-2 ${gone}`}>
      <div className="min-w-0">
        <PageTitle>{title}</PageTitle>
        {subtitle !== undefined && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
