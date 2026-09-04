import { convexTest } from "convex-test";
import { defineSchema } from "convex/server";
import { describe, expect, test } from "vitest";
import { recordTutorialView, tutorialSeenVersion, tutorialViewsTable } from "./tutorial";

// The table as an app declares it. The SDK ships no functions, so
// convex-test only needs a stand-in module map.
const schema = defineSchema({ tutorialViews: tutorialViewsTable });
const modules = { "./_generated/api.js": () => Promise.resolve({}) };

function grove(claims: Record<string, unknown> = {}) {
  const userId = (claims.userId as string) ?? "user1";
  return {
    subject: `${userId}|session1`,
    issuer: "https://grove.convex.site",
    tokenIdentifier: `https://grove.convex.site|${userId}|session1`,
    status: "active",
    ...claims,
  };
}

describe("tutorial views", () => {
  test("nobody has seen anything until they do, and the newest version wins", async () => {
    const t = convexTest(schema, modules);
    const ada = t.withIdentity(grove());
    expect(await ada.run((ctx) => tutorialSeenVersion(ctx))).toBeNull();

    await ada.run((ctx) => recordTutorialView(ctx, 2));
    expect(await ada.run((ctx) => tutorialSeenVersion(ctx))).toBe(2);

    // An older version recorded afterwards must not make the person look
    // like they are behind again.
    await ada.run((ctx) => recordTutorialView(ctx, 1));
    expect(await ada.run((ctx) => tutorialSeenVersion(ctx))).toBe(2);
  });

  test("recording the same version twice leaves one row", async () => {
    const t = convexTest(schema, modules);
    const ada = t.withIdentity(grove());
    await ada.run((ctx) => recordTutorialView(ctx, 1));
    await ada.run((ctx) => recordTutorialView(ctx, 1));
    const rows = await t.run((ctx) => ctx.db.query("tutorialViews").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: "user1", version: 1 });
  });

  test("views are per person", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(grove({ userId: "ada" })).run((ctx) => recordTutorialView(ctx, 3));
    const grace = t.withIdentity(grove({ userId: "grace" }));
    expect(await grace.run((ctx) => tutorialSeenVersion(ctx))).toBeNull();
  });

  test("the caller comes from the token: signed-out and pending are refused", async () => {
    const t = convexTest(schema, modules);
    await expect(t.run((ctx) => tutorialSeenVersion(ctx))).rejects.toThrow(/Not signed in/);
    const pending = t.withIdentity(grove({ status: "pending" }));
    await expect(pending.run((ctx) => recordTutorialView(ctx, 1))).rejects.toThrow(/pending/);
    await expect(pending.run((ctx) => tutorialSeenVersion(ctx))).rejects.toThrow(/pending/);
  });
});
