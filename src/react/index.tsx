// React side of a Grove app.
export {
  GroveProvider,
  useGrove,
  useGroveQuery,
  type GroveContextValue,
  type GroveProviderProps,
} from "./provider";
export {
  AUTH_PROBLEM_DELAY_MS,
  groveSignInUrl,
  PendingScreen,
  RequireSignedIn,
  Spinner,
  useMe,
} from "./guards";
export { DevSignIn } from "./DevSignIn";
export { GroveIcon } from "./GroveIcon";
// The app bar every Grove app shares: mark, name and version; the page's
// name in the middle on a phone; one menu for the nav and everything else.
export {
  GroveShell,
  isNavActive,
  sectionName,
  type GroveLinkProps,
  type GroveNavItem,
  type GroveShellProps,
  type GroveTheme,
} from "./GroveShell";
// The Notion-style bar over a table: search, Filter, Sort, Group, •••, and
// what is active as chips.
export {
  TableToolbar,
  type TableToolbarProps,
  type ToolbarFilter,
  type ToolbarGroup,
  type ToolbarOption,
  type ToolbarSort,
} from "./TableToolbar";
export {
  GroveMenu,
  GroveMenuItem,
  GroveMenuLabel,
  GroveMenuSeparator,
  useCloseMenu,
} from "./GroveMenu";
// A page's title (into the app bar while the nav is folded away) and its
// one-line description and buttons.
export { PageHeader, PageTitle, type NavBreakpoint } from "./PageTitle";
// For apps that draw their own header instead of using GroveShell: wrap
// the layout in TutorialProvider and drop TutorialButton in the header.
export { TutorialButton, TutorialProvider } from "./tutorialChrome";
export { useOpenChangelog, useReopenTutorial } from "./tutorialSlot";
export { GroveTutorial, type GroveTutorialProps } from "./GroveTutorial";
// The guided tour: steps that walk through the app itself (see GroveTour.tsx
// for the data-tour names the shell and toolbar carry).
export { GroveTour, type TourStep } from "./GroveTour";
// "Report a problem". GroveProvider already wraps the app in the provider
// and GroveShell shows the button; apps with their own header place
// ReportProblemButton themselves.
export {
  ReportProblemButton,
  ReportProvider,
  useReportContext,
  useReportProblem,
  type ReportProviderProps,
} from "../report";
// The Vxx.yy badge. Pass it the string from the app's src/app-version.ts.
export { GroveVersionBadge } from "./VersionBadge";
export { type ChangelogEntry, type TutorialSlide } from "./tutorialState";
export {
  groveApi,
  type FeedbackSubmission,
  type GroveAppCard,
  type GroveRosterEntry,
  type Me,
  type Role,
  type Status,
} from "./api";
