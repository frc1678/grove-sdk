import {
  defineTable,
  type GenericDatabaseReader,
  type GenericDatabaseWriter,
} from "convex/server";
import { v } from "convex/values";
import { requireEnv } from "./env";
import type { GroveUser, RosterRole } from "./identity";
import { seasonYearForDate } from "./season";

// The roster as the Grove serves it (GET /api/v1/roster) and as apps mirror
// it. The Grove owns who is on the team; apps keep this read-only copy so
// their queries and mutations can join against people without a network
// call. Refresh it on a cron (syncRoster in the template) and from the
// Grove's roster webhook.

export const rosterRoleValidator = v.union(
  v.literal("student"),
  v.literal("lead"),
  v.literal("coach"),
);

export const groveRosterTable = defineTable({
  // The Grove's rosterEntries id — the stable handle for a person-season.
  entryId: v.string(),
  name: v.string(),
  email: v.string(),
  altEmails: v.array(v.string()),
  role: rosterRoleValidator,
  year: v.number(),
  // The Grove `users` id once the person has signed up.
  userId: v.optional(v.string()),
  github: v.optional(v.string()),
  onshape: v.optional(v.string()),
  slackId: v.optional(v.string()),
  slackHandle: v.optional(v.string()),
  subteam: v.optional(v.string()),
  additionalGroups: v.array(v.string()),
  proposedDeletion: v.boolean(),
  syncedAt: v.number(),
})
  .index("entryId", ["entryId"])
  .index("year", ["year"])
  .index("userId", ["userId"])
  .index("email", ["email"]);

export type RosterEntry = {
  entryId: string;
  name: string;
  email: string;
  altEmails: string[];
  role: RosterRole;
  year: number;
  userId?: string;
  github?: string;
  onshape?: string;
  slackId?: string;
  slackHandle?: string;
  subteam?: string;
  additionalGroups: string[];
  proposedDeletion: boolean;
};

export type RosterSnapshot = {
  year: number;
  years: number[];
  entries: RosterEntry[];
};

type RosterDto = Omit<RosterEntry, "entryId"> & { id: string };

// ——— Talking to the Grove (actions only: this does network I/O) ———

export function groveApiHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${requireEnv("GROVE_APP_KEY")}`,
    Accept: "application/json",
  };
}

export function groveSiteUrl(): string {
  // The first issuer is the Grove this app is registered on.
  return requireEnv("GROVE_SITE_URL").split(",")[0].trim().replace(/\/$/, "");
}

export async function fetchGroveRoster(year?: number): Promise<RosterSnapshot> {
  const url = new URL("/api/v1/roster", groveSiteUrl());
  if (year !== undefined) url.searchParams.set("year", String(year));
  const response = await fetch(url, { headers: groveApiHeaders() });
  if (!response.ok) {
    throw new Error(`Grove roster request failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { year: number; years: number[]; entries: RosterDto[] };
  return {
    year: body.year,
    years: body.years,
    entries: body.entries.map(({ id, ...rest }) => ({ entryId: id, ...rest })),
  };
}

export type GroupVocabulary = {
  primarySubteams: string[];
  additionalGroups: string[];
  roleGroups: string[];
  all: string[];
};

export async function fetchGroveGroups(): Promise<GroupVocabulary> {
  const response = await fetch(new URL("/api/v1/groups", groveSiteUrl()), {
    headers: groveApiHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Grove groups request failed: ${response.status}`);
  }
  return (await response.json()) as GroupVocabulary;
}

// Tell the Grove about an email address this app saw that the roster
// doesn't know. It lands in Admin → Identities for a person to resolve.
export async function proposeIdentity(proposal: {
  email: string;
  name?: string;
  suggestedEntryId?: string;
  context?: string;
}): Promise<{ created: boolean; status: string }> {
  const response = await fetch(new URL("/api/v1/identity-proposals", groveSiteUrl()), {
    method: "POST",
    headers: { ...groveApiHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(proposal),
  });
  if (!response.ok) {
    throw new Error(`Grove identity proposal failed: ${response.status}`);
  }
  return (await response.json()) as { created: boolean; status: string };
}

// ——— The mirror table (queries and mutations) ———

// The SDK can't know the app's data model, so the mirror table is addressed
// by name through loosely typed readers (an app's typed ctx.db is accepted
// as-is). Apps see typed rows through the RosterEntry type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyReader = GenericDatabaseReader<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWriter = GenericDatabaseWriter<any>;
type MirrorRow = RosterEntry & { _id: string; _creationTime: number; syncedAt: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (db: AnyReader) => db.query("groveRoster" as any) as any;

export async function rosterForYear(
  ctx: { db: AnyReader },
  year: number = seasonYearForDate(),
): Promise<RosterEntry[]> {
  const rows: MirrorRow[] = await table(ctx.db)
    .withIndex("year", (q: any) => q.eq("year", year))
    .collect();
  return rows.map(stripRow);
}

export async function rosterEntryById(
  ctx: { db: AnyReader },
  entryId: string,
): Promise<RosterEntry | null> {
  const row: MirrorRow | null = await table(ctx.db)
    .withIndex("entryId", (q: any) => q.eq("entryId", entryId))
    .unique();
  return row === null ? null : stripRow(row);
}

// The roster row for a signed-in person: the entry named in their claims,
// else the row linked to their Grove user id, else a row with their email
// (primary or merged alt). Prefers the current season.
export async function rosterEntryForUser(
  ctx: { db: AnyReader },
  user: GroveUser,
): Promise<RosterEntry | null> {
  if (user.rosterEntryId !== undefined) {
    const byClaim = await rosterEntryById(ctx, user.rosterEntryId);
    if (byClaim !== null) return byClaim;
  }
  const year = seasonYearForDate();
  const pick = (rows: MirrorRow[]) =>
    rows.find((row) => row.year === year) ?? rows.sort((a, b) => b.year - a.year)[0] ?? null;
  const linked: MirrorRow[] = await table(ctx.db)
    .withIndex("userId", (q: any) => q.eq("userId", user.userId))
    .collect();
  if (linked.length > 0) {
    const row = pick(linked);
    return row === null ? null : stripRow(row);
  }
  const email = user.email?.toLowerCase();
  if (email === undefined) return null;
  const byEmail: MirrorRow[] = await table(ctx.db)
    .withIndex("email", (q: any) => q.eq("email", email))
    .collect();
  if (byEmail.length > 0) {
    const row = pick(byEmail);
    return row === null ? null : stripRow(row);
  }
  const all: MirrorRow[] = await table(ctx.db).collect();
  const row = pick(all.filter((candidate) => candidate.altEmails.includes(email)));
  return row === null ? null : stripRow(row);
}

// Upsert a snapshot for its season and drop mirror rows the Grove no longer
// lists for that season. Returns counts for the sync log.
export async function applyRosterSnapshot(
  ctx: { db: AnyWriter },
  snapshot: RosterSnapshot,
): Promise<{ added: number; updated: number; removed: number }> {
  const syncedAt = Date.now();
  const existing: MirrorRow[] = await table(ctx.db)
    .withIndex("year", (q: any) => q.eq("year", snapshot.year))
    .collect();
  const byEntryId = new Map(existing.map((row) => [row.entryId, row]));
  let added = 0;
  let updated = 0;
  for (const entry of snapshot.entries) {
    const current = byEntryId.get(entry.entryId);
    byEntryId.delete(entry.entryId);
    if (current === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.db.insert("groveRoster" as any, { ...entry, syncedAt });
      added += 1;
    } else {
      const { _id, _creationTime: _created, syncedAt: _seen, ...currentFields } = current;
      void _created;
      if (JSON.stringify(currentFields) !== JSON.stringify(entry)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ctx.db.replace(_id as any, { ...entry, syncedAt });
        updated += 1;
      }
    }
  }
  for (const stale of byEntryId.values()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.db.delete(stale._id as any);
  }
  return { added, updated, removed: byEntryId.size };
}

function stripRow(row: MirrorRow): RosterEntry {
  const { _id, _creationTime, syncedAt, ...entry } = row;
  void _id;
  void _creationTime;
  void syncedAt;
  return entry;
}
