import { useState, type ComponentType, type ReactNode } from "react";
import { useReportProblem } from "../report";
import { GroveIcon } from "./GroveIcon";
import { GroveMenu, GroveMenuItem, GroveMenuLabel, GroveMenuSeparator } from "./GroveMenu";
import { useMe } from "./guards";
import {
  BookIcon,
  ExternalIcon,
  FlagIcon,
  HelpIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  SparklesIcon,
  SunIcon,
} from "./icons";
import { PageTitleSlot, type NavBreakpoint } from "./PageTitle";
import { useGrove } from "./provider";
import { TutorialButton, TutorialProvider } from "./tutorialChrome";
import { useOpenChangelog, useReopenTutorial } from "./tutorialSlot";
import { GroveVersionBadge } from "./VersionBadge";

// The house chrome every Grove app shares, first built in Parts: one short
// row with the app's mark, name and version on the left; the page's name
// in the middle while the nav is folded away; and a menu on the right.
//
// - Phone: the menu holds everything — the nav, the tutorial, What's new,
//   Report a problem, the way back to the Grove, the theme, and sign out —
//   so the header is never more than one row of 48px.
// - From 640px: those sit in the header as icons; the menu holds the nav.
// - From `navFrom`: the nav is inline and the menu goes away.
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
  // Omit and there is no theme control (Retro follows the system).
  theme?: { dark: boolean; toggle: () => void };
  // The Grove hub. Apps are served under /<slug> on its origin, so "/".
  groveHref?: string;
  // Controls the app keeps in the header at every width — an event
  // switcher, a queue count. Keep them narrow: this row is 48px on a phone.
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

const ICON_BUTTON =
  "flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground";

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
  const bp = NAV[navFrom];
  const label = name ?? appName;
  const section = sectionName(nav, pathname);
  const major = majorOf(version);
  const who = me?.name ?? me?.email ?? "Signed in";
  const tutorialLabel = `How ${label} works`;

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
        <div className={`relative mx-auto flex h-12 w-full ${WIDTH[width]} items-center gap-2 px-4 sm:h-14`}>
          {/* The version beside the name, where the eye already goes to work
              out which app this is; on a phone under it, small, to leave the
              middle for the page's name. */}
          <Link to={homeTo ?? nav[0]?.to ?? "/"} className="flex shrink-0 items-center gap-2 font-semibold">
            {icon}
            <span className="flex flex-col items-start gap-0.5 leading-none sm:flex-row sm:items-center sm:gap-2">
              {label}
              {version !== undefined && (
                <GroveVersionBadge
                  version={version}
                  className="shrink-0 font-mono text-[0.625rem] leading-none font-normal tabular-nums text-muted-foreground/70 select-none sm:text-[0.6875rem]"
                />
              )}
            </span>
          </Link>

          {/* The page's name, centred, while the nav is folded into the menu:
              a page puts its own title here (PageTitle), else its nav item's. */}
          <div
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
          <div className={`ml-auto flex min-w-0 shrink-0 items-center gap-1 ${bp.pushRight}`}>
            {actions}
            <span className="hidden items-center gap-1 sm:flex">
              <a href={groveHref} title="Back to the Grove" aria-label="Back to the Grove" className={ICON_BUTTON}>
                <GroveIcon className="size-5" />
              </a>
              {report !== null && (
                <button
                  type="button"
                  title="Report a problem"
                  aria-label="Report a problem"
                  onClick={report.open}
                  className={ICON_BUTTON}
                >
                  <FlagIcon className="size-4" />
                </button>
              )}
              <HelpMenu
                tutorialLabel={tutorialLabel}
                reopenTutorial={reopenTutorial}
                openChangelog={openChangelog}
                major={major}
              />
              {theme !== undefined && (
                <button
                  type="button"
                  title={theme.dark ? "Light mode" : "Dark mode"}
                  aria-label={theme.dark ? "Light mode" : "Dark mode"}
                  onClick={theme.toggle}
                  className={ICON_BUTTON}
                >
                  {theme.dark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
                </button>
              )}
              <GroveMenu
                label="Account"
                buttonClassName="ml-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium hover:opacity-90"
                button={who.charAt(0).toUpperCase()}
              >
                <GroveMenuLabel>{who}</GroveMenuLabel>
                {menu !== undefined && (
                  <>
                    <GroveMenuSeparator />
                    {menu}
                  </>
                )}
                <GroveMenuSeparator />
                <GroveMenuItem icon={<LogOutIcon />} onSelect={() => void signOut()}>
                  Sign out
                </GroveMenuItem>
              </GroveMenu>
            </span>

            <GroveMenu
              label="Menu"
              button={<MenuIcon className="size-5" />}
              buttonClassName={`relative flex size-9 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent ${bp.folded}`}
              panelClassName="w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-xl"
            >
              {/* Two to a row: Parts has twelve pages, and a single column of
                  them pushed Sign out below a phone's fold. */}
              {nav.length > 0 && (
                <div className="grid grid-cols-2 gap-0.5">
                  {nav.map((item) => (
                    <GroveMenuItem
                      key={item.to}
                      active={isNavActive(item, pathname)}
                      trailing={item.newTab === true ? <ExternalIcon className="size-3" /> : item.badge}
                      render={(itemProps) => navLink(item, itemProps)}
                    >
                      {item.label}
                    </GroveMenuItem>
                  ))}
                </div>
              )}
              {/* On a phone the header has no icons, so all of it is here. */}
              <div className="sm:hidden">
                {nav.length > 0 && <GroveMenuSeparator />}
                {reopenTutorial !== null && (
                  <GroveMenuItem icon={<BookIcon />} onSelect={reopenTutorial}>
                    {tutorialLabel}
                  </GroveMenuItem>
                )}
                {openChangelog !== null && (
                  <GroveMenuItem icon={<SparklesIcon />} trailing={major} onSelect={openChangelog}>
                    What’s new
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
                {theme !== undefined && (
                  <GroveMenuItem icon={theme.dark ? <SunIcon /> : <MoonIcon />} onSelect={theme.toggle}>
                    {theme.dark ? "Light mode" : "Dark mode"}
                  </GroveMenuItem>
                )}
                {menu}
                <GroveMenuSeparator />
                <GroveMenuLabel>{who}</GroveMenuLabel>
                <GroveMenuItem icon={<LogOutIcon />} onSelect={() => void signOut()}>
                  Sign out
                </GroveMenuItem>
              </div>
            </GroveMenu>
          </div>
        </div>
      </header>
      <PageTitleSlot.Provider value={{ node: titleNode, from: navFrom }}>{children}</PageTitleSlot.Provider>
    </div>
  );
}

// The tutorial and the changelog behind one "?" in the header. With only
// one of them there is nothing to choose between, so it is a plain button.
function HelpMenu({
  tutorialLabel,
  reopenTutorial,
  openChangelog,
  major,
}: {
  tutorialLabel: string;
  reopenTutorial: (() => void) | null;
  openChangelog: (() => void) | null;
  major: string | undefined;
}) {
  if (reopenTutorial === null && openChangelog === null) return null;
  if (openChangelog === null) return <TutorialButton />;
  if (reopenTutorial === null) {
    return (
      <button
        type="button"
        title="What’s new"
        aria-label="What’s new"
        onClick={openChangelog}
        className={ICON_BUTTON}
      >
        <SparklesIcon className="size-4" />
      </button>
    );
  }
  return (
    <GroveMenu label="Help" buttonClassName={ICON_BUTTON} button={<HelpIcon className="size-[1.125rem]" />}>
      <GroveMenuItem icon={<BookIcon />} onSelect={reopenTutorial}>
        {tutorialLabel}
      </GroveMenuItem>
      <GroveMenuItem icon={<SparklesIcon />} trailing={major} onSelect={openChangelog}>
        What’s new
      </GroveMenuItem>
    </GroveMenu>
  );
}
