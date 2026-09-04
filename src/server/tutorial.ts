import {
  defineTable,
  type Auth,
  type GenericDatabaseReader,
  type GenericDatabaseWriter,
} from "convex/server";
import { v } from "convex/values";
import { requireActiveUser } from "./identity";

// Which tutorial version each person has got through. Every Grove app shows
// a short tutorial the first time someone opens it; the content is the
// app's, the bookkeeping is this. An app declares the table in its schema
// and wraps the two helpers in a query and a mutation — the same shape as
// the roster mirror in roster.ts.
//
// A row means "this person is done with version N", whether they finished
// it or skipped it. Bumping the app's version leaves the old rows behind
// and shows everyone the new tutorial once.

export const tutorialViewsTable = defineTable({
  // The Grove `users` id. People are never referenced by email.
  userId: v.string(),
  version: v.number(),
  seenAt: v.number(),
})
  // Compound so one person's rows come back on a prefix scan and an exact
  // (person, version) row is a point lookup. Named for both fields, which is
  // both the Convex guideline and this fleet's own convention — see the
  // Grove's sourceAndYear.
  .index("userIdAndVersion", ["userId", "version"]);

// The SDK can't know the app's data model, so the table is addressed by
// name through loosely typed readers, exactly as the roster mirror is.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyReader = GenericDatabaseReader<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWriter = GenericDatabaseWriter<any>;
type ViewRow = { _id: string; userId: string; version: number; seenAt: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (db: AnyReader) => db.query("tutorialViews" as any) as any;

// The newest tutorial version the caller has finished or skipped, or null
// if they have never seen one. <GroveTutorial> compares it with the app's
// current version: null or lower means open.
export async function tutorialSeenVersion(ctx: {
  db: AnyReader;
  auth: Auth;
}): Promise<number | null> {
  const user = await requireActiveUser(ctx);
  const rows: ViewRow[] = await table(ctx.db)
    .withIndex("userIdAndVersion", (q: any) => q.eq("userId", user.userId))
    .collect();
  if (rows.length === 0) return null;
  return rows.reduce((newest, row) => Math.max(newest, row.version), rows[0].version);
}

// Record that the caller is done with this version — called when they press
// Done and when they skip, so someone who skipped is not asked again.
export async function recordTutorialView(
  ctx: { db: AnyWriter; auth: Auth },
  version: number,
): Promise<null> {
  const user = await requireActiveUser(ctx);
  const existing: ViewRow | null = await table(ctx.db)
    .withIndex("userIdAndVersion", (q: any) =>
      q.eq("userId", user.userId).eq("version", version),
    )
    .unique();
  if (existing === null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.db.insert("tutorialViews" as any, {
      userId: user.userId,
      version,
      seenAt: Date.now(),
    });
  }
  return null;
}
