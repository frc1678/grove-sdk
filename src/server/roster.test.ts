import { convexTest } from "convex-test";
import { defineSchema } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { groveUserFromIdentity } from "./identity";
import {
  applyRosterSnapshot,
  fetchGroveRoster,
  groveRosterTable,
  rosterEntryForUser,
  rosterForYear,
  type RosterSnapshot,
} from "./roster";

// The mirror table as an app would declare it in its schema. convex-test
// wants a module map that includes a _generated path; the SDK has no
// functions, so an empty stand-in is enough.
const schema = defineSchema({ groveRoster: groveRosterTable });
const modules = { "./_generated/api.js": () => Promise.resolve({}) };

const snapshot = (entries: Partial<RosterSnapshot["entries"][number]>[]): RosterSnapshot => ({
  year: 2027,
  years: [2027, 2026],
  entries: entries.map((entry, index) => ({
    entryId: `entry${index}`,
    name: `Person ${index}`,
    email: `p${index}@example.com`,
    altEmails: [],
    role: "student",
    year: 2027,
    additionalGroups: [],
    proposedDeletion: false,
    ...entry,
  })),
});

describe("roster mirror", () => {
  test("applyRosterSnapshot adds, updates, and removes for one season", async () => {
    const t = convexTest(schema, modules);
    const first = await t.run((ctx) =>
      applyRosterSnapshot(ctx, snapshot([{}, { entryId: "gone" }])),
    );
    expect(first).toEqual({ added: 2, updated: 0, removed: 0 });

    // A different season is untouched by a 2027 sync.
    await t.run((ctx) =>
      applyRosterSnapshot(ctx, {
        ...snapshot([{ entryId: "old", year: 2026 }]),
        year: 2026,
      }),
    );

    const second = await t.run((ctx) =>
      applyRosterSnapshot(ctx, snapshot([{ subteam: "Software Robot" }])),
    );
    expect(second).toEqual({ added: 0, updated: 1, removed: 1 });

    const rows = await t.run((ctx) => rosterForYear(ctx, 2027));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entryId: "entry0", subteam: "Software Robot" });
    expect(rows[0]).not.toHaveProperty("_id");
    expect(await t.run((ctx) => rosterForYear(ctx, 2026))).toHaveLength(1);
  });

  test("rosterEntryForUser resolves by claim, then user id, then email or alt email", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      applyRosterSnapshot(
        ctx,
        snapshot([
          { entryId: "byClaim" },
          { entryId: "byUser", userId: "u2", email: "u2@example.com" },
          { entryId: "byAlt", email: "school@example.com", altEmails: ["home@example.com"] },
        ]),
      ),
    );
    const identity = (claims: Record<string, unknown>) =>
      groveUserFromIdentity({ subject: "u|s", issuer: "i", tokenIdentifier: "i|u|s", ...claims } as never);

    const viaClaim = await t.run((ctx) =>
      rosterEntryForUser(ctx, identity({ rosterEntryId: "byClaim" })),
    );
    expect(viaClaim?.entryId).toBe("byClaim");

    const viaUser = await t.run((ctx) =>
      rosterEntryForUser(ctx, { ...identity({}), userId: "u2" }),
    );
    expect(viaUser?.entryId).toBe("byUser");

    const viaAlt = await t.run((ctx) =>
      rosterEntryForUser(ctx, identity({ email: "Home@example.com" })),
    );
    expect(viaAlt?.entryId).toBe("byAlt");

    expect(await t.run((ctx) => rosterEntryForUser(ctx, identity({})))).toBeNull();
  });
});

describe("fetchGroveRoster", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("calls the Grove with the app key and renames id to entryId", async () => {
    vi.stubEnv("GROVE_SITE_URL", "https://grove.convex.site/, https://other.convex.site");
    vi.stubEnv("GROVE_APP_KEY", "grove_abc");
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          year: 2027,
          years: [2027],
          entries: [{ id: "e1", name: "A", email: "a@x", altEmails: [], role: "coach", year: 2027, additionalGroups: [], proposedDeletion: false }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchGroveRoster(2027);
    expect(result.entries[0]).toMatchObject({ entryId: "e1", role: "coach" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://grove.convex.site/api/v1/roster?year=2027");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer grove_abc");
  });

  test("surfaces a failed request", async () => {
    vi.stubEnv("GROVE_SITE_URL", "https://grove.convex.site");
    vi.stubEnv("GROVE_APP_KEY", "grove_abc");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    await expect(fetchGroveRoster()).rejects.toThrow(/401/);
  });
});
