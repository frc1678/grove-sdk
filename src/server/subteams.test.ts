import { describe, expect, test } from "vitest";
import { ADDITIONAL_GROUPS, CLEAN_LEADS_GROUP, entryInGroup, matchSubteamValue } from "./subteams";

describe("the Clean Leads group", () => {
  test("is one of the additional groups", () => {
    expect(ADDITIONAL_GROUPS).toContain(CLEAN_LEADS_GROUP);
    expect(entryInGroup(CLEAN_LEADS_GROUP, { subteam: "Hardware Design", additionalGroups: [CLEAN_LEADS_GROUP] })).toBe(true);
  });

  test("a sheet's “clean leads” cell is Clean Leads, not Leadership", () => {
    expect(matchSubteamValue("Clean Leads")).toEqual({ kind: "additional", name: "Clean Leads" });
    expect(matchSubteamValue("clean 15 lead")).toEqual({ kind: "additional", name: "Clean Leads" });
    expect(matchSubteamValue("Leadership")).toEqual({ kind: "additional", name: "Leadership" });
    expect(matchSubteamValue("leads")).toEqual({ kind: "additional", name: "Leadership" });
  });
});
