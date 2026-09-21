import { describe, expect, it } from "vitest";
import { formatGroveVersion, parseCommitCount } from "./versionFormat";

describe("formatGroveVersion", () => {
  it("pads both halves to two digits", () => {
    expect(formatGroveVersion(3, 7)).toBe("V03.07");
    expect(formatGroveVersion(1, 0)).toBe("V01.00");
  });

  it("lets the minor grow past two digits rather than wrapping", () => {
    // A hundred merges without a tutorial change is a long season, not an
    // error, and V03.100 is the honest label for it.
    expect(formatGroveVersion(3, 104)).toBe("V03.104");
  });

  it("keeps the label a fixed width while the major is under a hundred", () => {
    // The badge sits in a flex header; a label that changes width on a
    // deploy shifts whatever is beside it.
    expect(formatGroveVersion(1, 9)).toHaveLength(formatGroveVersion(99, 99).length);
  });
});

describe("parseCommitCount", () => {
  it("reads git's count", () => {
    expect(parseCommitCount("7")).toBe(7);
    expect(parseCommitCount("  12\n")).toBe(12);
  });

  it("is 0 rather than NaN when git gave nothing back", () => {
    // NaN here would reach a header as "VNaN". These are the shapes a
    // failed or empty `git rev-list` actually produces.
    expect(parseCommitCount(null)).toBe(0);
    expect(parseCommitCount("")).toBe(0);
    expect(parseCommitCount("fatal: bad revision")).toBe(0);
  });
});
