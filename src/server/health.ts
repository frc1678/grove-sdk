import { groveApiHeaders, groveSiteUrl } from "./roster";

// Grove Health: how an app tells the Grove what it runs and whether it's
// well (Admin → Health on the Grove). Two halves:
//
// - groveHealthResponse(), for the app's public `/<slug>/api/health` route.
//   The Grove calls it every 5 minutes from outside, like a person would.
//   It answers "up" and the version, and never any data: no sign-in, no
//   roster, nothing private.
// - reportGroveHealth(), from a 5-minute cron: the app's own components —
//   its agents and devices, its jobs, its integrations, the keys it issues —
//   sent with the app key to POST /api/v1/health. The list is whole: a
//   component the app stops listing is marked gone on the Grove.
//
// The Grove judges heartbeats itself: send `lastSeenAt` and
// `expectEverySec` and a component that goes quiet turns amber at twice its
// interval and red at three times, without the app having to notice.

export type GroveHealthStatus = "ok" | "warn" | "down" | "unknown";

export type GroveHealthComponent = {
  // Lowercase words joined by : . _ - (at most 80). The Grove files it as
  // "<slug>:<key>", so keys only need to be unique within the app.
  key: string;
  kind: "agent" | "job" | "integration" | "credential" | "service";
  name?: string;
  status: GroveHealthStatus;
  // Why, when it isn't ok. Shown on the Grove and in alerts.
  message?: string;
  lastSeenAt?: number;
  expectEverySec?: number;
  version?: string;
  host?: string;
  // For kind "credential": a key or token this app issues or holds.
  credential?: {
    createdAt?: number;
    rotatedAt?: number;
    expiresAt?: number;
    lastUsedAt?: number;
    policyDays?: number;
    location?: string;
    unlocks?: string;
  };
};

const KEY = /^[a-z0-9][a-z0-9:._-]{0,79}$/;

export function groveHealthResponse(
  info: { ok?: boolean; version?: string; sha?: string; message?: string } = {},
): Response {
  const body = {
    ok: info.ok ?? true,
    ...(info.version === undefined ? {} : { version: info.version }),
    ...(info.sha === undefined ? {} : { sha: info.sha }),
    ...(info.message === undefined ? {} : { message: info.message }),
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Throws on a key the Grove would refuse, so a typo fails in the app's own
// tests and logs, not silently on the Grove.
export async function reportGroveHealth(
  components: GroveHealthComponent[],
  options: { version?: string; sha?: string } = {},
): Promise<{ components: number }> {
  for (const component of components) {
    if (!KEY.test(component.key)) {
      throw new Error(`Grove Health: "${component.key}" isn't a valid key (${KEY.source})`);
    }
  }
  const response = await fetch(new URL("/api/v1/health", groveSiteUrl()), {
    method: "POST",
    headers: { ...groveApiHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, components }),
  });
  // A Grove from before Grove Health has no such route: say so once per
  // run and carry on, so an app can ship this before the Grove does.
  if (response.status === 404) {
    console.warn("Grove Health: this Grove doesn't take health reports yet (404); nothing sent");
    return { components: 0 };
  }
  if (!response.ok) {
    throw new Error(`Grove health report failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as { components: number };
}

// The template's hourly roster sync, from its latest groveSyncRuns row.
// Every app made from the template reports at least this one job.
export function rosterSyncHealth(
  run: { syncedAt: number; error?: string } | null,
): GroveHealthComponent {
  return {
    key: "job:grove-roster-sync",
    kind: "job",
    name: "Roster sync from the Grove",
    status: run === null ? "unknown" : run.error === undefined ? "ok" : "warn",
    message: run?.error,
    lastSeenAt: run === null ? undefined : run.syncedAt,
    expectEverySec: 3600,
  };
}

// A device or agent that checks in with the app (a pit agent, a printer
// bridge, a shop TV): the Grove turns it amber and red on its own when the
// check-ins stop.
export function heartbeatHealth(device: {
  key: string;
  name: string;
  kind?: "agent" | "service";
  lastSeenAt: number | undefined;
  expectEverySec: number;
  version?: string;
  host?: string;
  status?: GroveHealthStatus;
  message?: string;
}): GroveHealthComponent {
  return {
    key: device.key,
    kind: device.kind ?? "agent",
    name: device.name,
    status: device.status ?? (device.lastSeenAt === undefined ? "unknown" : "ok"),
    message: device.message,
    lastSeenAt: device.lastSeenAt,
    expectEverySec: device.expectEverySec,
    version: device.version,
    host: device.host,
  };
}
