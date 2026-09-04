import { describe, expect, test } from "vitest";
import { shouldAutoOpen } from "./tutorialState";

const base = { seenVersion: null, version: 1, status: "active", slideCount: 3 };

describe("shouldAutoOpen", () => {
  test("opens for someone who has never seen it", () => {
    expect(shouldAutoOpen(base)).toBe(true);
  });

  test("stays shut once they have seen this version, and reopens on a bump", () => {
    expect(shouldAutoOpen({ ...base, seenVersion: 1 })).toBe(false);
    expect(shouldAutoOpen({ ...base, seenVersion: 2 })).toBe(false);
    expect(shouldAutoOpen({ ...base, seenVersion: 1, version: 2 })).toBe(true);
  });

  test("stays shut while the seen-version query is still loading", () => {
    // The flash: opening on undefined and closing when the answer lands.
    expect(shouldAutoOpen({ ...base, seenVersion: undefined })).toBe(false);
  });

  test("never opens for an account that is not active", () => {
    expect(shouldAutoOpen({ ...base, status: "pending" })).toBe(false);
    expect(shouldAutoOpen({ ...base, status: "archived" })).toBe(false);
    expect(shouldAutoOpen({ ...base, status: undefined })).toBe(false);
  });

  test("an app with no slides has no tutorial", () => {
    expect(shouldAutoOpen({ ...base, slideCount: 0 })).toBe(false);
  });
});
