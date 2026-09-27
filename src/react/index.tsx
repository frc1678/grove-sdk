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
export { GroveShell } from "./GroveShell";
// For apps that draw their own header instead of using GroveShell: wrap
// the layout in TutorialProvider and drop TutorialButton in the header.
export { TutorialButton, TutorialProvider } from "./tutorialChrome";
export { GroveTutorial, type GroveTutorialProps } from "./GroveTutorial";
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
export { type TutorialSlide } from "./tutorialState";
export {
  groveApi,
  type FeedbackSubmission,
  type GroveAppCard,
  type GroveRosterEntry,
  type Me,
  type Role,
  type Status,
} from "./api";
