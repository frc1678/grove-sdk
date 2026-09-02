// The canonical group vocabulary for every Grove app. The Grove owns roster
// and group metadata; apps (Chime, …) read these names rather than defining
// their own, so a person's groups mean the same thing everywhere.
//
// Every student has one primary subteam; the secondary subteam is Impact,
// Strategy, or neither.

export const PRIMARY_SUBTEAMS = [
  "Hardware Design",
  "Hardware Electrical",
  "Hardware Fabrication",
  "Software Robot",
  "Software Front-End",
  "Software Back-End",
  "Business and Media",
] as const;

// Cross-cutting groups a person can belong to on top of their subteam. Any
// number of them, assigned per person on the roster.
export const ADDITIONAL_GROUPS = [
  "Leadership",
  "Outreach Leads",
  "Impact",
  "Strategy",
  "Safety",
] as const;

// Being tagged Leadership grants admin privileges across the Grove — see
// hasManagerAccess() in lib/access.ts. Named here so nothing hardcodes it.
export const LEADERSHIP_GROUP = "Leadership";
export const OUTREACH_LEADS_GROUP = "Outreach Leads";

// Groups derived from a person's roster role rather than assigned. Coaches
// are a role already, so apps address them without a duplicate checkbox.
export const ROLE_GROUPS = ["Coaches"] as const;

// Every group name an app may target, in display order.
export const ALL_GROUPS: string[] = [
  ...PRIMARY_SUBTEAMS,
  ...ADDITIONAL_GROUPS,
  ...ROLE_GROUPS,
];

// Does a roster entry belong to a named group?
export function entryInGroup(
  group: string,
  entry: { subteam?: string; additionalGroups?: string[]; role?: string },
): boolean {
  if (group === "Coaches") return entry.role === "coach";
  if (entry.subteam === group) return true;
  return entry.additionalGroups?.includes(group) ?? false;
}

export type SubteamMatch =
  | { kind: "primary"; name: (typeof PRIMARY_SUBTEAMS)[number] }
  | { kind: "additional"; name: (typeof ADDITIONAL_GROUPS)[number] };

// Fuzzy-map a free-text cell ("fab", "SW backend", "Business & Media",
// "impact") to a canonical group. Returns null when nothing matches.
export function matchSubteamValue(cell: string): SubteamMatch | null {
  const value = cell.toLowerCase().replace(/[^a-z ]/g, " ").trim();
  if (value === "") return null;
  // Additional groups first — they're the most distinctive words.
  if (value.includes("impact")) return { kind: "additional", name: "Impact" };
  if (value.includes("strat")) return { kind: "additional", name: "Strategy" };
  if (value.includes("safety"))
    return { kind: "additional", name: "Safety" };
  if (value.includes("outreach"))
    return { kind: "additional", name: "Outreach Leads" };
  if (/\blead(er|ership)?s?\b/.test(value))
    return { kind: "additional", name: "Leadership" };
  if (/\bfront/.test(value))
    return { kind: "primary", name: "Software Front-End" };
  if (/\bback/.test(value))
    return { kind: "primary", name: "Software Back-End" };
  if (value.includes("elec"))
    return { kind: "primary", name: "Hardware Electrical" };
  if (value.includes("fab") || value.includes("machin") || value.includes("manufactur"))
    return { kind: "primary", name: "Hardware Fabrication" };
  if (value.includes("design") || value.includes("cad"))
    return { kind: "primary", name: "Hardware Design" };
  if (value.includes("robot") || value.includes("control"))
    return { kind: "primary", name: "Software Robot" };
  if (value.includes("business") || value.includes("media") || value.includes("marketing"))
    return { kind: "primary", name: "Business and Media" };
  return null;
}
