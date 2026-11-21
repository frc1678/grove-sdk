import { afterEach, expect, test, vi } from "vitest";
import { groveHealthResponse, heartbeatHealth, reportGroveHealth, rosterSyncHealth } from "./health";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("the health route answers up, with its version and nothing else", async () => {
  const response = groveHealthResponse({ version: "V03.07" });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ ok: true, version: "V03.07" });
});

test("posts the components to the Grove with the app key", async () => {
  vi.stubEnv("GROVE_SITE_URL", "https://grove.citruscircuits.org, https://tame-donkey-518.convex.site");
  vi.stubEnv("GROVE_APP_KEY", "grove_abc");
  const fetchMock = vi.fn(async () => Response.json({ ok: true, components: 1 }));
  vi.stubGlobal("fetch", fetchMock);

  const result = await reportGroveHealth([rosterSyncHealth({ syncedAt: 1000 })], { version: "V03.07" });

  expect(result.components).toBe(1);
  const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
  expect(String(url)).toBe("https://grove.citruscircuits.org/api/v1/health");
  expect((init.headers as Record<string, string>).Authorization).toBe("Bearer grove_abc");
  expect(JSON.parse(init.body as string)).toEqual({
    version: "V03.07",
    components: [
      { key: "job:grove-roster-sync", kind: "job", name: "Roster sync from the Grove", status: "ok", lastSeenAt: 1000, expectEverySec: 3600 },
    ],
  });
});

test("refuses a key the Grove would refuse, before sending anything", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await expect(reportGroveHealth([{ key: "Pit Agent", kind: "agent", status: "ok" }])).rejects.toThrow(/valid key/);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("throws with the Grove's status and reason", async () => {
  vi.stubEnv("GROVE_SITE_URL", "https://grove.citruscircuits.org");
  vi.stubEnv("GROVE_APP_KEY", "grove_abc");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("bad component", { status: 400 })));
  await expect(reportGroveHealth([])).rejects.toThrow(/400 bad component/);
});

test("roster sync and heartbeat components", () => {
  expect(rosterSyncHealth(null).status).toBe("unknown");
  expect(rosterSyncHealth({ syncedAt: 5, error: "HTTP 401" })).toMatchObject({ status: "warn", message: "HTTP 401" });
  expect(heartbeatHealth({ key: "agent:pit-1", name: "Pit 1", lastSeenAt: undefined, expectEverySec: 60 }).status).toBe(
    "unknown",
  );
  expect(heartbeatHealth({ key: "agent:pit-1", name: "Pit 1", lastSeenAt: 9, expectEverySec: 60, host: "pit-1" })).toMatchObject({
    kind: "agent",
    status: "ok",
    host: "pit-1",
  });
});
