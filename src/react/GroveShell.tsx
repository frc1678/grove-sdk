import { useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useReportProblem } from "../report";
import { GroveIcon } from "./GroveIcon";
import { GroveMenu, GroveMenuItem, GroveMenuLabel, GroveMenuSeparator } from "./GroveMenu";
import { useMe } from "./guards";
import {
  BookIcon,
  ExternalIcon,
  FlagIcon,
  LogOutIcon,
  MenuIcon,
  MonitorIcon,
  MoonIcon,
  SparklesIcon,
  SunIcon,
} from "./icons";
import { PageTitleSlot, type NavBreakpoint } from "./PageTitle";
import { useGrove } from "./provider";
import { TutorialProvider } from "./tutorialChrome";
import { useOpenChangelog, useReopenTutorial } from "./tutorialSlot";
import { GroveVersionBadge } from "./VersionBadge";

// The house chrome every Grove app shares, first built in Parts: one short
// row with the app's mark, name and version on the left; the page's name
// in the middle while the nav is folded away; and a menu on the right.
//
// - Below `navFrom`: the menu holds everything — the pages, the tutorial,
//   What's new, Report a problem, the way back to the Grove, the theme, and
//   sign out — so the header is never more than one row of 48px.
// - From `navFrom`: the pages are inline in the header and the menu holds
//   the rest. There are no other header buttons at any width: one menu,
//   always in the same place.
//
// Links go through the app's own router (`link`), so moving between pages
// never reloads. Styled with the shared theme tokens, no shadcn.

export type GroveNavItem = {
  // A path inside the app, as the router sees it ("/queue", not "/parts/queue").
  to: string;
  label: string;
  // For pages meant for another screen (a shop display): opens a new tab
  // and is never taken as the current page's name.
  newTab?: boolean;
  // A count beside the label: requests waiting, reports open.
  badge?: ReactNode;
  // When "active" is more than a prefix match — a tab in the query string,
  // a detail page that belongs to another item.
  match?: (pathname: string) => boolean;
};

export type GroveTheme = {
  theme?: string;
  resolvedTheme?: string;
  setTheme: (theme: string) => void;
};

const THEMES = [
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
  { key: "system", label: "System" },
] as const;

// What the shell hands the app's link component. React Router's <Link>
// takes these as they are: pass `link={Link}`.
export type GroveLinkProps = {
  to: string;
  className?: string;
  children?: ReactNode;
  onClick?: () => void;
  target?: string;
  rel?: string;
  role?: string;
  title?: string;
  "aria-current"?: "page";
};

export type GroveShellProps = {
  // The app's mark — the same favicon.svg the tab and the Grove card show.
  icon: ReactNode;
  // Defaults to the name the app gave GroveProvider.
  name?: string;
  // "V03.07", from the app's src/app-version.ts.
  version?: string;
  // Where the name links. Defaults to the first nav item.
  homeTo?: string;
  nav?: GroveNavItem[];
  // The router's current pathname (useLocation().pathname).
  pathname: string;
  link: ComponentType<GroveLinkProps>;
  // From which width the nav sits inline. Pick the width at which every
  // label fits on one row: Parts' twelve need xl.
  navFrom?: NavBreakpoint;
  // The width the header's contents line up with; match the app's <main>.
  width?: "6xl" | "7xl" | "screen-2xl" | "full";
  // next-themes' useTheme(), as it is: `theme={useTheme()}`. Light, Dark,
  // or System. Omit and there is no theme control (Retro follows the system).
  theme?: GroveTheme;
  // The Grove hub. Apps are served under /<slug> on its origin, so "/".
  groveHref?: string;
  // Controls the app keeps in the header at every width — an event
  // switcher, a queue count. Capped at 40% of a phone's width and cut off
  // past it, so a wide one cannot push the menu off the screen.
  actions?: ReactNode;
  // Extra GroveMenuItems: in the menu on a phone, in the account menu above.
  menu?: ReactNode;
  children: ReactNode;
};

const NAV: Record<NavBreakpoint, { inline: string; folded: string; pushRight: string }> = {
  md: { inline: "hidden md:flex", folded: "md:hidden", pushRight: "md:ml-0" },
  lg: { inline: "hidden lg:flex", folded: "lg:hidden", pushRight: "lg:ml-0" },
  xl: { inline: "hidden xl:flex", folded: "xl:hidden", pushRight: "xl:ml-0" },
};

const WIDTH = {
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
  "screen-2xl": "max-w-screen-2xl",
  full: "max-w-none",
} as const;


export function isNavActive(item: GroveNavItem, pathname: string): boolean {
  if (item.match !== undefined) return item.match(pathname);
  if (item.to === "/") return pathname === "/";
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/**
 * The page's name for the app bar when the page gives none: the nav item
 * it sits under. A new-tab item is another screen, never "this page".
 */
export function sectionName(nav: readonly GroveNavItem[], pathname: string): string | undefined {
  return nav.find((item) => item.newTab !== true && isNavActive(item, pathname))?.label;
}

// The major from "V38.04" — what the changelog is keyed by.
function majorOf(version: string | undefined): string | undefined {
  return version?.split(".")[0] || undefined;
}

export function GroveShell(props: GroveShellProps) {
  // The provider wraps the header too, not just children: the menu lives
  // up there and has to see what the tutorial registered.
  return (
    <TutorialProvider>
      <Shell {...props} />
    </TutorialProvider>
  );
}

function Shell({
  icon,
  name,
  version,
  homeTo,
  nav = [],
  pathname,
  link: Link,
  navFrom = "lg",
  width = "7xl",
  theme,
  groveHref = "/",
  actions,
  menu,
  children,
}: GroveShellProps) {
  const { appName, signOut } = useGrove();
  const me = useMe();
  const report = useReportProblem();
  const reopenTutorial = useReopenTutorial();
  const openChangelog = useOpenChangelog();
  const [titleNode, setTitleNode] = useState<HTMLElement | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLSpanElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [titleMax, setTitleMax] = useState<number | undefined>(undefined);

  // The page's name is centred on the bar, not between its neighbours, so
  // it gets whatever is left on its narrower side: a long app name or a
  // wide `actions` makes it truncate instead of running into them. CSS
  // cannot say "centred, but no wider than the gap", so it is measured.
  useLayoutEffect(() => {
    const bar = barRef.current;
    const left = leftRef.current;
    const right = rightRef.current;
    if (bar === null || left === null || right === null) return;
    const measure = () => {
      const box = bar.getBoundingClientRect();
      const middle = box.left + box.width / 2;
      const half = Math.min(middle - left.getBoundingClientRect().right, right.getBoundingClientRect().left - middle) - 8;
      setTitleMax(Math.max(0, Math.floor(half * 2)));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    for (const node of [bar, left, right]) observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const bp = NAV[navFrom];
  const label = name ?? appName;
  const section = sectionName(nav, pathname);
  const major = majorOf(version);
  const who = me?.name ?? me?.email ?? "Signed in";
  const tutorialLabel = `How ${label} works`;
  const flagged = nav.some((item) => item.badge !== undefined && item.badge !== null && item.badge !== false);

  const navLink = (item: GroveNavItem, extra: Omit<GroveLinkProps, "to">) => (
    <Link
      to={item.to}
      {...(item.newTab === true ? { target: "_blank", rel: "noreferrer" } : {})}
      {...extra}
    />
  );

  return (
    // overflow-x-clip, not -hidden: hidden would make this a scroll
    // container and break the sticky header. --grove-header is the header's
    // height including its border, for pages that fill the viewport.
    <div className="flex min-h-svh flex-col overflow-x-clip bg-background text-foreground [--grove-header:calc(3rem_+_1px)] sm:[--grove-header:calc(3.5rem_+_1px)]">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur print:hidden">
        <div ref={barRef} className={`relative mx-auto flex h-12 w-full ${WIDTH[width]} items-center gap-2 px-4 sm:h-14`}>
          {/* The version beside the name, where the eye already goes to work
              out which app this is; on a phone under it, small, to leave the
              middle for the page's name. */}
          <span ref={leftRef} className="flex min-w-0 shrink-0">
          <Link to={homeTo ?? nav[0]?.to ?? "/"} className="flex min-w-0 items-center gap-2 font-semibold">
            {icon}
            <span className="flex flex-col items-start gap-0.5 leading-none sm:flex-row sm:items-center sm:gap-2">
              <span className="whitespace-nowrap">{label}</span>
              {version !== undefined && (
                <GroveVersionBadge
                  version={version}
                  className="shrink-0 font-mono text-[0.625rem] leading-none font-normal tabular-nums text-muted-foreground/70 select-none sm:text-[0.6875rem]"
                />
              )}
            </span>
          </Link>
          </span>

          {/* The page's name, centred, while the nav is folded into the menu:
              a page puts its own title here (PageTitle), else its nav item's. */}
          <div
            style={titleMax === undefined ? undefined : { maxWidth: titleMax }}
            className={`group/title pointer-events-none absolute left-1/2 max-w-[42%] -translate-x-1/2 text-center text-base font-semibold sm:max-w-[36%] ${bp.folded}`}
          >
            <div ref={setTitleNode} className="pointer-events-auto" />
            {section !== undefined && (
              <span className="block truncate group-has-[[data-page-title]]/title:hidden">{section}</span>
            )}
          </div>

          <nav className={`${bp.inline} min-w-0 flex-1 items-center gap-0.5`}>
            {nav.map((item) => {
              const active = isNavActive(item, pathname);
              return (
                <span key={item.to} className="contents">
                  {navLink(item, {
                    className: `flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                      active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                    }`,
                    ...(active ? { "aria-current": "page" as const } : {}),
                    children: (
                      <>
                        {item.label}
                        {item.badge}
                      </>
                    ),
                  })}
                </span>
              );
            })}
          </nav>

          {/* min-w-0 and shrink-0 are load-bearing: a flex item defaults to
              min-width:auto, and this cluster once pushed Sign out clean off
              a phone. */}
          <div ref={rightRef} className={`ml-auto flex min-w-0 shrink-0 items-center gap-1 ${bp.pushRight}`}>
            {actions !== undefined && (
              <div className="flex min-w-0 max-w-[40vw] items-center gap-1 overflow-hidden sm:max-w-none sm:overflow-visible">
                {actions}
              </div>
            )}
            <GroveMenu
              label={flagged ? "Menu, something needs attention" : "Menu"}
              button={
                <>
                  <MenuIcon className="size-5" />
                  {/* A page in the menu has a count (Forms' unmatched
                      responses, the Grove's reset requests): say so on the
                      button while the pages are folded into it, or the
                      count is out of sight on a phone. */}
                  {flagged && (
                    <span
                      aria-hidden="true"
                      className={`absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-500 ring-2 ring-background ${bp.folded}`}
                    />
                  )}
                </>
              }
              buttonClassName="relative flex size-9 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent"
              panelClassName="w-[min(15rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-xl"
            >
              {/* The pages, one to a row, while the nav is folded away; from
                  `navFrom` they are in the header and only the rest is here. */}
              {nav.length > 0 && (
                <div role="none" className={bp.folded}>
                  <div role="none" className="grid gap-0.5">
                    {nav.map((item) => (
                      <GroveMenuItem
                        key={item.to}
                        // A notch tighter than the rest, so Parts' thirteen
                        // pages and Sign out fit on a phone without scrolling.
                        dense
                        active={isNavActive(item, pathname)}
                        trailing={item.newTab === true ? <ExternalIcon className="size-3" /> : item.badge}
                        render={(itemProps) => navLink(item, itemProps)}
                      >
                        {item.label}
                      </GroveMenuItem>
                    ))}
                  </div>
                  <GroveMenuSeparator />
                </div>
              )}
              {reopenTutorial !== null && (
                <GroveMenuItem icon={<BookIcon />} onSelect={reopenTutorial}>
                  {tutorialLabel}
                </GroveMenuItem>
              )}
              {openChangelog !== null && (
                <GroveMenuItem icon={<SparklesIcon />} trailing={major} onSelect={openChangelog}>
                  What's new
                </GroveMenuItem>
              )}
              {report !== null && (
                <GroveMenuItem icon={<FlagIcon />} onSelect={report.open}>
                  Report a problem
                </GroveMenuItem>
              )}
              <GroveMenuItem icon={<GroveIcon />} render={(itemProps) => <a href={groveHref} {...itemProps} />}>
                Back to the Grove
              </GroveMenuItem>
              {theme !== undefined && <ThemeRow theme={theme} />}
              {menu}
              <GroveMenuSeparator />
              <GroveMenuLabel>{who}</GroveMenuLabel>
              <GroveMenuItem icon={<LogOutIcon />} onSelect={() => void signOut()}>
                Sign out
              </GroveMenuItem>
            </GroveMenu>
          </div>
        </div>
      </header>
      <PageTitleSlot.Provider value={{ node: titleNode, from: navFrom, section }}>{children}</PageTitleSlot.Provider>
    </div>
  );
}

// Light, Dark, System as three small icons beside the word: one tap each,
// and the menu stays open so the change can be seen. Icons rather than
// words, so the row is no wider than the menu's other items.
function ThemeRow({ theme }: { theme: GroveTheme }) {
  const current = theme.theme ?? "system";
  const icons = { light: SunIcon, dark: MoonIcon, system: MonitorIcon } as const;
  return (
    <div role="group" aria-label="Theme" className="flex items-center gap-2.5 px-2 py-1 text-sm">
      <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&>svg]:size-4">
        {theme.resolvedTheme === "dark" ? <MoonIcon /> : <SunIcon />}
      </span>
      Theme
      <div className="ml-auto flex gap-0.5 rounded-lg bg-muted p-0.5">
        {THEMES.map((option) => {
          const Icon = icons[option.key];
          return (
            <button
              key={option.key}
              type="button"
              role="menuitemradio"
              aria-checked={current === option.key}
              aria-label={option.label}
              title={option.label}
              onClick={() => theme.setTheme(option.key)}
              className={`flex size-7 items-center justify-center rounded-md ${current === option.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="size-3.5" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
