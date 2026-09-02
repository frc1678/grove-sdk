import { anyApi, type FunctionReference } from "convex/server";

// The Grove's public functions that apps call live from the browser, typed
// by hand because the Grove's generated api isn't importable across repos.
// Keep in step with grove/convex/{users,roster,apps}.ts.

type Query<A extends Record<string, unknown>, Ret> = FunctionReference<
  "query",
  "public",
  A,
  Ret
>;
type NoArgs = Record<string, never>;

export type Role = "student" | "lead" | "coach" | "admin";
export type Status = "active" | "pending" | "archived";

export type Me = {
  _id: string;
  _creationTime: number;
  name?: string;
  email?: string;
  role?: Role;
  effectiveRole?: Role;
  status?: Status;
};

export type GroveRosterEntry = {
  _id: string;
  _creationTime: number;
  name: string;
  email: string;
  altEmails?: string[];
  role: "student" | "lead" | "coach";
  year: number;
  userId?: string;
  github?: string;
  onshape?: string;
  slackId?: string;
  slackHandle?: string;
  subteam?: string;
  additionalGroups?: string[];
  proposedDeletion?: boolean;
};

export type GroveAppCard = {
  _id: string;
  slug: string;
  name: string;
  description?: string;
  icon: string;
  href: string;
  external: boolean;
};

export const groveApi = {
  users: {
    me: anyApi.users.me as Query<NoArgs, Me | null>,
  },
  roster: {
    currentYear: anyApi.roster.currentYear as Query<NoArgs, number>,
    years: anyApi.roster.years as Query<NoArgs, number[]>,
    list: anyApi.roster.list as Query<{ year: number }, GroveRosterEntry[]>,
  },
  apps: {
    listForMe: anyApi.apps.listForMe as Query<NoArgs, GroveAppCard[]>,
  },
};
