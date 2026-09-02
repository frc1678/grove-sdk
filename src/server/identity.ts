import type { Auth, UserIdentity } from "convex/server";

// The Grove's identity contract, read off the JWT the Grove issued. See
// grove/convex/lib/claims.ts for the writer side. Apps never accept a user
// id as an argument for authorization; everything comes from here.

export type Role = "student" | "lead" | "coach" | "admin";
export type Status = "active" | "pending" | "archived";
export type RosterRole = "student" | "lead" | "coach";

export const ROLES: Role[] = ["student", "lead", "coach", "admin"];
const ROLE_RANK: Record<Role, number> = { student: 0, lead: 1, coach: 2, admin: 3 };

// Roles that manage things across the Grove: approve accounts, edit the
// roster, run app admin screens. Matches grove/convex/lib/access.ts.
export const MANAGER_ROLES: Role[] = ["lead", "coach", "admin"];

export type GroveUser = {
  // The Grove `users` id. Opaque to apps; store it as a string.
  userId: string;
  sessionId: string;
  name?: string;
  email?: string;
  // The stored role; almost always what you want is effectiveRole.
  role: Role;
  // The role the Grove enforces (Leadership on the roster grants admin).
  effectiveRole: Role;
  status: Status;
  rosterEntryId?: string;
  rosterYear?: number;
  rosterRole?: RosterRole;
  subteam?: string;
  groups: string[];
};

type AuthCtx = { auth: Auth };

function asRole(value: unknown, fallback: Role): Role {
  return typeof value === "string" && (ROLES as string[]).includes(value)
    ? (value as Role)
    : fallback;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function groveUserFromIdentity(identity: UserIdentity): GroveUser {
  // Convex Auth encodes "<userId>|<sessionId>" in the subject.
  const [userId, sessionId = ""] = identity.subject.split("|");
  const claims = identity as Record<string, unknown>;
  const role = asRole(claims.role, "student");
  const status = claims.status;
  return {
    userId,
    sessionId,
    name: asString(claims.name),
    email: asString(claims.email),
    role,
    effectiveRole: asRole(claims.effectiveRole, role),
    status:
      status === "pending" || status === "archived" || status === "active"
        ? status
        : "active",
    rosterEntryId: asString(claims.rosterEntryId),
    rosterYear: typeof claims.rosterYear === "number" ? claims.rosterYear : undefined,
    rosterRole:
      claims.rosterRole === "student" ||
      claims.rosterRole === "lead" ||
      claims.rosterRole === "coach"
        ? claims.rosterRole
        : undefined,
    subteam: asString(claims.subteam),
    groups: Array.isArray(claims.groups)
      ? claims.groups.filter((group): group is string => typeof group === "string")
      : [],
  };
}

// The signed-in Grove user, or null when the request carries no valid token.
export async function groveUser(ctx: AuthCtx): Promise<GroveUser | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity === null ? null : groveUserFromIdentity(identity);
}

export async function requireUser(ctx: AuthCtx): Promise<GroveUser> {
  const user = await groveUser(ctx);
  if (user === null) {
    throw new Error("Not signed in");
  }
  return user;
}

// Pending and archived accounts see a holding page in every app.
export async function requireActiveUser(ctx: AuthCtx): Promise<GroveUser> {
  const user = await requireUser(ctx);
  if (user.status !== "active") {
    throw new Error(
      user.status === "pending" ? "Account is pending approval" : "Account is archived",
    );
  }
  return user;
}

export function isManager(user: Pick<GroveUser, "effectiveRole">): boolean {
  return MANAGER_ROLES.includes(user.effectiveRole);
}

export async function requireManager(ctx: AuthCtx): Promise<GroveUser> {
  const user = await requireActiveUser(ctx);
  if (!isManager(user)) {
    throw new Error("Requires lead, coach, or admin role");
  }
  return user;
}

export function roleAtLeast(user: Pick<GroveUser, "effectiveRole">, min: Role): boolean {
  return ROLE_RANK[user.effectiveRole] >= ROLE_RANK[min];
}

export async function requireRole(ctx: AuthCtx, min: Role): Promise<GroveUser> {
  const user = await requireActiveUser(ctx);
  if (!roleAtLeast(user, min)) {
    throw new Error(`Requires ${min} role or higher`);
  }
  return user;
}

// Coaches: a stored coach role, an admin account (the type coaches get), or
// a coach row on the roster.
export function isCoach(user: GroveUser): boolean {
  return user.role === "coach" || user.role === "admin" || user.rosterRole === "coach";
}

// Membership in a roster group: the person's subteam, an additional group
// (Leadership, Impact, …), or the role-derived "Coaches" group.
export function userInGroup(user: GroveUser, group: string): boolean {
  if (group === "Coaches") return isCoach(user);
  if (user.subteam === group) return true;
  return user.groups.includes(group);
}
