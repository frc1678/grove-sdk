import { describe, expect, it } from "vitest";
import { legacyTarget, matchLegacyPattern } from "./legacyPaths";

const foundry = {
  base: "/foundry/",
  previousBases: ["/parts/"],
  paths: [
    ["/", "/parts"],
    ["/sheet/:machine/:id", "/setup-sheets/:machine/:id"],
    ["/design/m/:id/*", "/robots/mechanisms/:id/*"],
  ] as const,
};

describe("matchLegacyPattern", () => {
  it("captures params and a trailing splat", () => {
    expect(matchLegacyPattern("/e/:id/*", "/e/abc/t/print")).toEqual({ id: "abc", "*": "t/print" });
    expect(matchLegacyPattern("/e/:id/*", "/e/abc")).toEqual({ id: "abc", "*": "" });
  });
  it("matches whole paths only", () => {
    expect(matchLegacyPattern("/e/:id", "/e/abc/more")).toBeNull();
    expect(matchLegacyPattern("/", "/events")).toBeNull();
    expect(matchLegacyPattern("/", "/")).toEqual({});
  });
});

describe("legacyTarget", () => {
  it("moves an old base to the new one, keeping the rest", () => {
    expect(legacyTarget("/parts/queue", foundry)).toBe("/foundry/queue");
    expect(legacyTarget("/parts/parts/k123", foundry)).toBe("/foundry/parts/k123");
  });
  it("applies a page rename under the old base too", () => {
    expect(legacyTarget("/parts/sheet/mill/7", foundry)).toBe("/foundry/setup-sheets/mill/7");
    expect(legacyTarget("/parts", foundry)).toBe("/foundry/parts");
    expect(legacyTarget("/parts/", foundry)).toBe("/foundry/parts");
  });
  it("renames pages under the current base", () => {
    expect(legacyTarget("/foundry/", foundry)).toBe("/foundry/parts");
    expect(legacyTarget("/foundry/design/m/9", foundry)).toBe("/foundry/robots/mechanisms/9");
    expect(legacyTarget("/foundry/design/m/9/bought", foundry)).toBe("/foundry/robots/mechanisms/9/bought");
  });
  it("leaves current addresses alone", () => {
    expect(legacyTarget("/foundry/queue", foundry)).toBeNull();
    expect(legacyTarget("/foundry/parts", foundry)).toBeNull();
    expect(legacyTarget("/chime/events", foundry)).toBeNull();
    expect(legacyTarget("/partsy/queue", foundry)).toBeNull();
  });
  it("tries entries in order", () => {
    const options = { base: "/x/", paths: [["/a/:id", "/b/:id"], ["/a/*", "/c/*"]] as const };
    expect(legacyTarget("/x/a/1", options)).toBe("/x/b/1");
    expect(legacyTarget("/x/a/1/2", options)).toBe("/x/c/1/2");
  });
});
