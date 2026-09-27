import type { ConvexReactClient } from "convex/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { groveApi } from "../react/api";
import { buildReportContext, type ReportContext } from "./context";
import { installErrorBuffer, recentErrors } from "./errorBuffer";
import { ReportSheet } from "./ReportSheet";
import { captureViewport } from "./screenshot";
import { initGroveSentry, setGroveSentryUser } from "./sentry";

// "Report a problem" in every Grove app: a screenshot to draw on, a line of
// text, and the context nobody thinks to mention — the build, the URL, the
// screen size, the errors the page logged — sent to the Grove, which files
// it and posts it to Slack.
//
// Deliberately independent of GroveProvider: it needs only the Grove's
// Convex client, so the Grove itself, which has its own provider tree, can
// use the same sheet. GroveProvider renders one of these for every app.

// At import, not at mount: the errors worth reporting are often the ones
// thrown during the first render, before any effect has run.
installErrorBuffer();

type ContextSource = () => Record<string, unknown>;

type ReportValue = {
  open: () => void;
  register: (source: ContextSource) => () => void;
};

const ReportContextValue = createContext<ReportValue | null>(null);

type OpenReport = {
  screenshot: HTMLCanvasElement | null;
  context: ReportContext;
  fullJson: string;
};

export type ReportProviderProps = {
  // The GROVE's client — reports go to the Grove, whichever app files them.
  client: ConvexReactClient;
  // The app's slug, as registered in Admin → Apps.
  app: string;
  // "V03.07", from the app's src/app-version.ts.
  version?: string;
  // The signed-in Grove account, for Sentry's user field. The Grove itself
  // takes the reporter from the token, never from here.
  user?: { id: string; role?: string } | null;
  children: ReactNode;
};

export function ReportProvider({ client, app, version, user, children }: ReportProviderProps) {
  const sources = useRef(new Set<ContextSource>());
  const [report, setReport] = useState<OpenReport | null>(null);
  const opening = useRef(false);

  useEffect(() => {
    let cancelled = false;
    client.query(groveApi.feedback.clientConfig, {}).then(
      ({ sentryDsn }) => {
        if (cancelled || sentryDsn === null) return;
        void initGroveSentry({ dsn: sentryDsn, app, version, environment: import.meta.env.MODE });
      },
      // A warning, not an error: console.error feeds the report's own error
      // buffer, and a Grove that predates feedback would otherwise leave
      // this in every report that app ever sends.
      (error: unknown) => console.warn("[grove] could not load the report config", error),
    );
    return () => {
      cancelled = true;
    };
  }, [client, app, version]);

  const userId = user?.id;
  const userRole = user?.role;
  useEffect(() => {
    setGroveSentryUser(userId === undefined ? null : { id: userId, role: userRole });
  }, [userId, userRole]);

  const open = useCallback(async () => {
    if (opening.current) return;
    opening.current = true;
    // Context first, then the screenshot: both describe the moment the
    // button was pressed, and the capture takes long enough for that to
    // matter on a match clock.
    const { context, fullJson } = buildReportContext({
      url: window.location.href,
      version,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
      },
      userAgent: navigator.userAgent,
      coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
      errors: recentErrors(),
      extra: collectExtra(sources.current),
    });
    // Before the sheet renders, so the sheet is not in its own screenshot.
    // A capture that fails still opens the sheet: the text is the report,
    // the picture is a bonus.
    let screenshot: HTMLCanvasElement | null = null;
    try {
      screenshot = await captureViewport();
    } catch (error) {
      console.warn("[grove] could not capture the screen for a report", error);
    }
    setReport({ screenshot, context, fullJson });
  }, [version]);

  const close = useCallback(() => {
    opening.current = false;
    setReport(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // `code`, not `key`: on a Mac, Option turns R into "®".
      if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === "KeyR") {
        event.preventDefault();
        void open();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const register = useCallback((source: ContextSource) => {
    sources.current.add(source);
    return () => {
      sources.current.delete(source);
    };
  }, []);

  const value = useMemo<ReportValue>(() => ({ open: () => void open(), register }), [open, register]);

  return (
    <ReportContextValue.Provider value={value}>
      {children}
      {report !== null && (
        <ReportSheet
          client={client}
          app={app}
          screenshot={report.screenshot}
          context={report.context}
          fullJson={report.fullJson}
          onClose={close}
        />
      )}
    </ReportContextValue.Provider>
  );
}

// Merged in registration order; a later key wins. One source that throws
// is noted in the report rather than stopping it — a broken page is the
// case this exists for.
function collectExtra(sources: Set<ContextSource>): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const source of sources) {
    try {
      Object.assign(extra, source());
    } catch (error) {
      extra.reportContextError = error instanceof Error ? error.message : String(error);
    }
  }
  return extra;
}

/**
 * Add app state to every report filed while this component is mounted.
 * Called when a report opens, not on every render, so it can hand over
 * something expensive — Sim passes its lobby, match, and replay input log:
 *
 *   useReportContext(() => ({ lobbyId, matchId, replayLog: recorder.log() }))
 *
 * Outside a report provider it does nothing.
 */
export function useReportContext(source: ContextSource): void {
  const report = useContext(ReportContextValue);
  // Kept current during render so the registered wrapper always reads the
  // newest closure, without re-registering on every render.
  const latest = useRef(source);
  latest.current = source;
  useEffect(() => {
    if (report === null) return;
    return report.register(() => latest.current());
  }, [report]);
}

/** A way to open the report sheet, or null outside a report provider. */
export function useReportProblem(): { open: () => void } | null {
  const report = useContext(ReportContextValue);
  return useMemo(() => (report === null ? null : { open: report.open }), [report]);
}

/**
 * The header button. Icon-only by default, for the same phone-width reason
 * as TutorialButton; pass children for a text label. Renders nothing
 * outside a report provider.
 */
export function ReportProblemButton({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const report = useReportProblem();
  if (report === null) return null;

  return (
    <button
      type="button"
      onClick={report.open}
      title="Report a problem"
      aria-label="Report a problem"
      className={
        className ??
        "flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
      }
    >
      {children ?? (
        <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
          <path d="M5 17.5V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path
            d="M5 3.5h9.2l-2 3.5 2 3.5H5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
