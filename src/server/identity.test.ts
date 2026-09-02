import { describe, expect, test } from "vitest";
import {
  groveUserFromIdentity,
  isCoach,
  isManager,
  requireActiveUser,
  requireManager,
  roleAtLeast,
  userInGroup,
} from "./identity";

const identity = (claims: Record<string, unknown>) =>
  ({
    tokenIdentifier: "https://grove.convex.site|user123|sess456",
    issuer: "https://grove.convex.site",
    subject: "user123|sess456",
    ...claims,
  }) as never;

const ctxFor = (claims: Record<string, unknown> | null) => ({
  auth: {
    getUserIdentity: async () => (claims === null ? null : identity(claims)),
    getUserIdentityWithoutVerification: async () => null,
  },
});

describe("groveUserFromIdentity", () => {
  test("reads the Grove claims and splits the subject", () => {
    const user = groveUserFromIdentity(
      identity({
        name: "Ada",
        email: "ada@example.com",
        role: "student",
        effectiveRole: "admin",
        status: "active",
        rosterEntryId: "entry1",
        rosterYear: 2027,
        rosterRole: "lead",
        subteam: "Software Robot",
        groups: ["Leadership", 42],
      }),
    );
    expect(user).toEqual({
      userId: "user123",
      sessionId: "sess456",
      name: "Ada",
      email: "ada@example.com",
      role: "student",
      effectiveRole: "admin",
      status: "active",
      rosterEntryId: "entry1",
      rosterYear: 2027,
      rosterRole: "lead",
      subteam: "Software Robot",
      groups: ["Leadership"],
    });
  });

  test("a token with no Grove claims is an active student with no roster", () => {
    const user = groveUserFromIdentity(identity({}));
    expect(user).toMatchObject({ role: "student", effectiveRole: "student", status: "active", groups: [] });
    expect(user.rosterEntryId).toBeUndefined();
  });

  test("garbage claim values fall back safely", () => {
    const user = groveUserFromIdentity(identity({ role: "root", status: "weird", groups: "x" }));
    expect(user.role).toBe("student");
    expect(user.status).toBe("active");
    expect(user.groups).toEqual([]);
  });
});

describe("guards", () => {
  test("requireActiveUser rejects signed-out and pending callers", async () => {
    await expect(requireActiveUser(ctxFor(null))).rejects.toThrow(/Not signed in/);
    await expect(requireActiveUser(ctxFor({ status: "pending" }))).rejects.toThrow(/pending/);
    await expect(requireActiveUser(ctxFor({ status: "archived" }))).rejects.toThrow(/archived/);
    await expect(requireActiveUser(ctxFor({ status: "active" }))).resolves.toMatchObject({
      userId: "user123",
    });
  });

  test("requireManager honours effectiveRole, not the stored role", async () => {
    await expect(requireManager(ctxFor({ role: "student" }))).rejects.toThrow(/Requires/);
    await expect(
      requireManager(ctxFor({ role: "student", effectiveRole: "admin" })),
    ).resolves.toMatchObject({ effectiveRole: "admin" });
  });

  test("role helpers", () => {
    const lead = groveUserFromIdentity(identity({ role: "lead" }));
    expect(isManager(lead)).toBe(true);
    expect(roleAtLeast(lead, "coach")).toBe(false);
    expect(roleAtLeast(lead, "student")).toBe(true);
    expect(isCoach(lead)).toBe(false);
    expect(isCoach(groveUserFromIdentity(identity({ role: "student", rosterRole: "coach" })))).toBe(true);
  });

  test("group membership covers subteam, extra groups, and the Coaches role group", () => {
    const user = groveUserFromIdentity(
      identity({ role: "coach", subteam: "Hardware Design", groups: ["Impact"] }),
    );
    expect(userInGroup(user, "Hardware Design")).toBe(true);
    expect(userInGroup(user, "Impact")).toBe(true);
    expect(userInGroup(user, "Coaches")).toBe(true);
    expect(userInGroup(user, "Strategy")).toBe(false);
  });
});
