import { describe, expect, test } from "vitest";
import {
  defineGroveIndex,
  groveIndex,
  validateGroveIndex,
  type GroveIndexEntry,
} from "./searchIndex.js";

// Harvest's real pages: the shape every app's index takes.
const HARVEST = defineGroveIndex([
  {
    path: "/request",
    title: "Request",
    summary: "Ask the team to buy a part or supply.",
    keywords: ["order", "buy", "purchase"],
  },
  { path: "/orders", title: "Orders", summary: "See what has been ordered and when it arrives." },
  {
    path: "/orders?tab=all",
    title: "All requests",
    summary: "Every request anyone has made, open or done.",
    minRole: "lead",
  },
  {
    path: "/inventory",
    title: "Annual inventory",
    summary: "Count what the shop has at the end of the season.",
    keywords: ["count", "stock"],
  },
  { path: "/locations", title: "Locations", summary: "Find which bin or shelf a part lives on." },
  { path: "/catalog", title: "Catalog", summary: "Look up parts the team buys often." },
  { path: "/settings", title: "Settings", summary: "Set budgets and vendors.", minRole: "coach" },
]);

const ok = { path: "/a", title: "A", summary: "Do a thing." };

function errorsFor(entry: Record<string, unknown>): string[] {
  const result = validateGroveIndex([{ ...ok, ...entry }]);
  return result.errors ?? [];
}

test("a realistic index passes, with minRole filled in and the rest untouched", () => {
  const result = validateGroveIndex(HARVEST);
  expect(result.errors).toBeUndefined();
  expect(result.entries?.map((entry) => entry.minRole)).toEqual([
    "student",
    "student",
    "lead",
    "student",
    "student",
    "student",
    "coach",
  ]);
  expect(result.entries?.[0]).toEqual({ ...HARVEST[0], minRole: "student" });
  expect(result.entries?.[1]).not.toHaveProperty("keywords");
});

test("trims titles, summaries and keywords", () => {
  const result = validateGroveIndex([
    { path: "/a", title: "  Orders ", summary: "\tSee orders.\n", keywords: [" buy "] },
  ]);
  expect(result.entries).toEqual([
    { path: "/a", title: "Orders", summary: "See orders.", keywords: ["buy"], minRole: "student" },
  ]);
});

describe("path", () => {
  test.each([
    ["missing", undefined, /path is required/],
    ["not a string", 7, /path is required/],
    ["relative", "request", /must start with "\/"/],
    ["protocol-relative", "//evil.example/x", /must not start with "\/\/"/],
    ["backslash", "/a\\b", /backslash/],
    ["whitespace", "/a b", /whitespace/],
    ["a URL inside", "/go?to=https://evil.example", /":\/\/"/],
    ["too long", `/${"a".repeat(200)}`, /at most 200/],
  ])("refuses %s", (_, path, rule) => {
    expect(errorsFor({ path })).toEqual([expect.stringMatching(rule)]);
  });

  test("allows a query string and exactly 200 characters", () => {
    expect(errorsFor({ path: "/orders?tab=open" })).toEqual([]);
    expect(errorsFor({ path: `/${"a".repeat(199)}` })).toEqual([]);
  });
});

describe("title and summary", () => {
  test.each([
    ["title", "", /title must be 1–60/],
    ["title", "   ", /title must be 1–60/],
    ["title", "x".repeat(61), /title must be 1–60/],
    ["title", undefined, /title is required/],
    ["summary", " ", /summary must be 1–200/],
    ["summary", "x".repeat(201), /summary must be 1–200/],
    ["summary", 3, /summary is required/],
  ])("refuses %s %j", (field, value, rule) => {
    expect(errorsFor({ [field]: value })).toEqual([expect.stringMatching(rule)]);
  });

  test("measures the limit after trimming", () => {
    expect(errorsFor({ title: ` ${"x".repeat(60)} `, summary: ` ${"y".repeat(200)} ` })).toEqual([]);
  });
});

describe("keywords", () => {
  test("allows 12, refuses 13", () => {
    expect(errorsFor({ keywords: Array.from({ length: 12 }, (_, i) => `k${i}`) })).toEqual([]);
    expect(errorsFor({ keywords: Array.from({ length: 13 }, (_, i) => `k${i}`) })).toEqual([
      expect.stringMatching(/at most 12 keywords/),
    ]);
  });

  test("names the bad keyword", () => {
    expect(errorsFor({ keywords: ["buy", " ", "x".repeat(41), 5] })).toEqual([
      expect.stringMatching(/keywords\[1\] must be 1–40/),
      expect.stringMatching(/keywords\[2\] must be 1–40/),
      expect.stringMatching(/keywords\[3\] is required and must be a string/),
    ]);
  });

  test("refuses a single string", () => {
    expect(errorsFor({ keywords: "buy" })).toEqual([expect.stringMatching(/keywords must be an array/)]);
  });
});

test("minRole must be a Grove role", () => {
  expect(errorsFor({ minRole: "mentor" })).toEqual([
    expect.stringMatching(/minRole must be one of student, lead, coach, admin/),
  ]);
  expect(errorsFor({ minRole: "admin" })).toEqual([]);
});

test("a misspelt field is an error, not silently dropped", () => {
  expect(errorsFor({ minrole: "coach" })).toEqual([expect.stringMatching(/unknown field "minrole"/)]);
});

test("names each bad entry by position and path, and reports every problem", () => {
  const result = validateGroveIndex([ok, { path: "/b", title: "", summary: "" }, "nope"]);
  expect(result.errors).toEqual([
    "entry 2 (/b): title must be 1–60 characters once trimmed",
    "entry 2 (/b): summary must be 1–200 characters once trimmed",
    "entry 3: must be an object",
  ]);
});

test("refuses a second entry with the same path", () => {
  const result = validateGroveIndex([ok, { ...ok, title: "Again" }]);
  expect(result.errors).toEqual(["entry 2 (/a): path is already used by an earlier entry"]);
});

test("allows 60 entries, refuses 61", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...ok, path: `/p${i}` }));
  expect(validateGroveIndex(many(60)).errors).toBeUndefined();
  expect(validateGroveIndex(many(61)).errors).toEqual(["at most 60 entries, got 61"]);
});

test("refuses something that is not a list", () => {
  expect(validateGroveIndex({ entries: [] }).errors).toEqual(["entries must be an array"]);
});

describe("groveIndex", () => {
  test("emits grove-index.json with the normalized entries", () => {
    const emitted: Array<{ type: string; fileName: string; source: string }> = [];
    const plugin = groveIndex([{ ...ok, title: " A " }]);
    (plugin.generateBundle as unknown as (this: unknown) => void).call({
      emitFile: (file: (typeof emitted)[number]) => emitted.push(file),
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ type: "asset", fileName: "grove-index.json" });
    expect(JSON.parse(emitted[0].source)).toEqual({
      version: 1,
      entries: [{ path: "/a", title: "A", summary: "Do a thing.", minRole: "student" }],
    });
  });

  test("throws when the config loads, listing every problem", () => {
    const bad = [{ path: "orders", title: "", summary: "x" }] as GroveIndexEntry[];
    expect(() => groveIndex(bad)).toThrow(
      /grove-index\.json has 2 problem\(s\):\n {2}- entry 1 \(orders\): path must start with "\/"\n {2}- entry 1 \(orders\): title/,
    );
  });

  test("serves the same file from the dev server under base", () => {
    const plugin = groveIndex(HARVEST);
    (plugin.configResolved as unknown as (config: { base: string }) => void)({ base: "/harvest" });
    let middleware!: (req: { url?: string }, res: unknown, next: () => void) => void;
    (plugin.configureServer as unknown as (server: unknown) => void)({
      middlewares: { use: (fn: typeof middleware) => (middleware = fn) },
    });

    const headers: Record<string, string> = {};
    let body = "";
    const res = { setHeader: (k: string, v: string) => (headers[k] = v), end: (b: string) => (body = b) };
    middleware({ url: "/harvest/grove-index.json?t=1" }, res, () => {
      throw new Error("should have served it");
    });
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(body).entries).toHaveLength(HARVEST.length);

    let passed = false;
    middleware({ url: "/grove-index.json" }, res, () => (passed = true));
    expect(passed).toBe(true);
  });
});
