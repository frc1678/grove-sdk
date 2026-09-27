import { describe, expect, test } from "vitest";
import { appSlugFromBase, buildReportContext, deviceClass, MAX_EXTRA_LENGTH } from "./context";

describe("deviceClass", () => {
  test("splits on width", () => {
    expect(deviceClass({ width: 375, height: 812, coarsePointer: true })).toBe("phone");
    expect(deviceClass({ width: 639, height: 900, coarsePointer: false })).toBe("phone");
    expect(deviceClass({ width: 820, height: 1180, coarsePointer: true })).toBe("tablet");
    expect(deviceClass({ width: 1280, height: 800, coarsePointer: false })).toBe("desktop");
  });

  test("a phone on its side is still a phone", () => {
    expect(deviceClass({ width: 844, height: 390, coarsePointer: true })).toBe("phone");
    // The same short window with a mouse is a small desktop window.
    expect(deviceClass({ width: 844, height: 390, coarsePointer: false })).toBe("tablet");
  });
});

describe("appSlugFromBase", () => {
  test("takes the first path segment of Vite's base", () => {
    expect(appSlugFromBase("/sim/")).toBe("sim");
    expect(appSlugFromBase("/mission-planner/app/")).toBe("mission-planner");
  });

  test("an app served from the root is the Grove", () => {
    expect(appSlugFromBase("/")).toBe("grove");
    expect(appSlugFromBase("./")).toBe("grove");
  });
});

describe("buildReportContext", () => {
  const input = {
    url: "https://tame-donkey-518.convex.site/sim/match/42?lobby=7",
    version: "V03.07",
    viewport: { width: 375, height: 812, dpr: 3 },
    userAgent: "Mozilla/5.0 (iPhone)",
    coarsePointer: true,
    errors: [{ at: 1, message: "boom" }],
  };

  test("carries the page, build, device, and errors, and no extra when none was given", () => {
    const { context, fullJson } = buildReportContext({ ...input, extra: {} });
    expect(context).toEqual({
      url: input.url,
      version: "V03.07",
      viewport: input.viewport,
      userAgent: input.userAgent,
      device: "phone",
      consoleErrors: [{ at: 1, message: "boom" }],
    });
    expect(JSON.parse(fullJson)).toEqual(context);
  });

  test("leaves out a version the build did not inject", () => {
    const { context } = buildReportContext({ ...input, version: "", extra: {} });
    expect(context).not.toHaveProperty("version");
  });

  test("truncates extra for the Grove but keeps it whole for Sentry", () => {
    const replayLog = "x".repeat(MAX_EXTRA_LENGTH * 2);
    const { context, fullJson } = buildReportContext({
      ...input,
      extra: { matchId: "m1", replayLog },
    });
    expect(context.extra).toHaveLength(MAX_EXTRA_LENGTH);
    expect(context.extra!.startsWith('{"matchId":"m1","replayLog":"xxx')).toBe(true);
    expect(JSON.parse(fullJson).extra).toEqual({ matchId: "m1", replayLog });
  });

  test("an extra that cannot be serialised is reported rather than fatal", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const { context, fullJson } = buildReportContext({ ...input, extra: { cyclic } });
    expect(JSON.parse(context.extra!)).toHaveProperty("unserialisable");
    expect(JSON.parse(fullJson).url).toBe(input.url);
  });
});
