import { afterEach, expect, test, vi } from "vitest";
import { notifyGroveDeployed } from "./deployed";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("posts the commit and version to the Grove with the app key", async () => {
  vi.stubEnv("GROVE_SITE_URL", "https://grove.convex.site/, https://other.convex.site");
  vi.stubEnv("GROVE_APP_KEY", "grove_abc");
  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);

  await notifyGroveDeployed({ sha: "abc123", version: "V03.07" });

  const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
  expect(String(url)).toBe("https://grove.convex.site/api/v1/deployed");
  expect(init.method).toBe("POST");
  const headers = init.headers as Record<string, string>;
  expect(headers.Authorization).toBe("Bearer grove_abc");
  expect(headers["Content-Type"]).toBe("application/json");
  expect(JSON.parse(init.body as string)).toEqual({ sha: "abc123", version: "V03.07" });
});

test("throws with the Grove's status and reason", async () => {
  vi.stubEnv("GROVE_SITE_URL", "https://grove.convex.site");
  vi.stubEnv("GROVE_APP_KEY", "grove_abc");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("unknown app", { status: 401 })));
  await expect(notifyGroveDeployed({ sha: "abc123" })).rejects.toThrow(/401 unknown app/);
});
