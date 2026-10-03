import { describe, expect, test } from "vitest";
import { autoOpening, unseenChanges, type ChangelogEntry } from "./tutorialState";

const changelog: ChangelogEntry[] = [
  { version: 2, changes: ["two"] },
  { version: 3, changes: ["three"] },
  { version: 4, changes: ["four"] },
];
const base = { seenVersion: null, version: 3, status: "active", slideCount: 3, changelog };

describe("autoOpening", () => {
  test("a first-time visitor gets the tutorial, not the changelog", () => {
    expect(autoOpening(base)).toBe("tutorial");
  });

  test("a returning visitor on an older version gets the changelog, not the tutorial", () => {
    expect(autoOpening({ ...base, seenVersion: 2 })).toBe("changelog");
    expect(autoOpening({ ...base, seenVersion: 1 })).toBe("changelog");
  });

  test("stays shut once they are on this version or later", () => {
    expect(autoOpening({ ...base, seenVersion: 3 })).toBeNull();
    expect(autoOpening({ ...base, seenVersion: 4 })).toBeNull();
  });

  test("a bump with no changelog entry opens nothing rather than re-showing the tutorial", () => {
    expect(autoOpening({ ...base, seenVersion: 2, changelog: [] })).toBeNull();
    // Only an entry ahead of the build: written early, not shipped yet.
    expect(
      autoOpening({ ...base, seenVersion: 2, changelog: [{ version: 4, changes: ["x"] }] }),
    ).toBeNull();
  });

  test("stays shut while the seen-version query is still loading", () => {
    // The flash: opening on undefined and closing when the answer lands.
    expect(autoOpening({ ...base, seenVersion: undefined })).toBeNull();
  });

  test("never opens for an account that is not active", () => {
    for (const status of ["pending", "archived", undefined]) {
      expect(autoOpening({ ...base, status })).toBeNull();
      expect(autoOpening({ ...base, seenVersion: 2, status })).toBeNull();
    }
  });

  test("an app with no slides has no tutorial", () => {
    expect(autoOpening({ ...base, slideCount: 0 })).toBeNull();
  });
});

describe("unseenChanges", () => {
  test("everything after the version they last dismissed, up to this build, newest first", () => {
    expect(unseenChanges(changelog, 1, 3).map((entry) => entry.version)).toEqual([3, 2]);
  });

  test("nothing when they are current", () => {
    expect(unseenChanges(changelog, 3, 3)).toEqual([]);
  });
});
