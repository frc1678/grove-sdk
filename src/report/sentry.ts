// Sentry, for the half of a problem report nobody can type: the errors
// that happened with no one watching, and a replay of the minute before a
// report was filed.
//
// Loaded with import() and only once the Grove has answered with a DSN, so
// an app on a Grove with no Sentry project — every local dev deployment,
// for a start — never downloads a byte of it.

type Sentry = typeof import("@sentry/browser");

let sentry: Sentry | null = null;
let starting = false;
// Set before init finishes (users.me often resolves first), applied once
// it has.
let pendingUser: { id: string; role?: string } | null = null;

export async function initGroveSentry({
  dsn,
  app,
  version,
  environment,
}: {
  dsn: string;
  app: string;
  version?: string;
  environment: string;
}): Promise<void> {
  if (starting) return;
  starting = true;
  const Sentry = await import("@sentry/browser");
  Sentry.init({
    dsn,
    release: `${app}@${version ?? "dev"}`,
    environment,
    tracesSampleRate: 0,
    // Buffer mode: the last minute of the session is kept in memory and
    // sent only when an error happens or someone files a report. Recording
    // every session would burn through Sentry's free-tier replay quota in
    // a day of build season.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.replayIntegration({
        // Text is left readable because a replay of an internal team tool
        // with every word blanked out shows nothing worth watching. Inputs
        // stay masked: they are where passwords, and anything else someone
        // would not want replayed, get typed.
        maskAllText: false,
        maskAllInputs: true,
        blockAllMedia: false,
      }),
    ],
  });
  Sentry.setTag("app", app);
  sentry = Sentry;
  applyUser();
}

// The Grove user id and role, and nothing that names the person. Most of
// the team are minors, and their names and emails stay out of a third
// party; the Slack thread that carries the report names the reporter.
export function setGroveSentryUser(user: { id: string; role?: string } | null): void {
  pendingUser = user;
  applyUser();
}

function applyUser(): void {
  if (sentry === null) return;
  sentry.setUser(pendingUser === null ? null : { id: pendingUser.id });
  sentry.setTag("role", pendingUser?.role);
}

// Send the report to Sentry too, with the replay of what led up to it.
// Returns the event id to store beside the Grove's copy, or undefined when
// Sentry is not running here.
export async function captureGroveFeedback({
  message,
  app,
  kind,
  url,
  screenshot,
  contextJson,
}: {
  message: string;
  app: string;
  kind: "bug" | "idea";
  url: string;
  screenshot?: Uint8Array;
  contextJson: string;
}): Promise<string | undefined> {
  if (sentry === null) return undefined;
  // captureFeedback only uploads a buffered replay itself when the source
  // is "api"; with our own source it would attach the id of a replay that
  // was never sent. Flushing first sends the buffer and keeps recording,
  // so the feedback event below links to a replay that exists.
  await sentry.getReplay()?.flush();
  return sentry.captureFeedback(
    { message, source: "grove-report", tags: { app, kind }, url },
    {
      includeReplay: true,
      attachments: [
        ...(screenshot === undefined
          ? []
          : [{ filename: "screenshot.png", data: screenshot, contentType: "image/png" }]),
        { filename: "context.json", data: contextJson, contentType: "application/json" },
      ],
    },
  );
}
