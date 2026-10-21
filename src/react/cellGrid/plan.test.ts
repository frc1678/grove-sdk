import { describe, expect, test } from "vitest";
import { parseNumber, parseOption, parseText } from "./parse";
import { fillTarget, planFill, planPaste } from "./plan";

const grid = (cols: string[][]) => (r: number, c: number) => {
  const text = cols[c]?.[r] ?? "";
  const n = Number(text);
  return { text, number: text !== "" && Number.isFinite(n) ? n : undefined };
};

describe("fillTarget", () => {
  const source = { r0: 2, r1: 3, c0: 1, c1: 1 };
  test("stretches along the axis the pointer went furthest past", () => {
    expect(fillTarget(source, { r: 6, c: 2 })).toEqual({ r0: 2, r1: 6, c0: 1, c1: 1 });
    expect(fillTarget(source, { r: 0, c: 1 })).toEqual({ r0: 0, r1: 3, c0: 1, c1: 1 });
    expect(fillTarget(source, { r: 3, c: 4 })).toEqual({ r0: 2, r1: 3, c0: 1, c1: 4 });
  });
  test("nothing while the pointer is still inside the source", () => {
    expect(fillTarget(source, { r: 3, c: 1 })).toBeNull();
  });
});

describe("planFill", () => {
  test("text repeats in order down the column", () => {
    const read = grid([["Ready", "Done"]]);
    expect(planFill({ r0: 0, r1: 1, c0: 0, c1: 0 }, { r0: 0, r1: 4, c0: 0, c1: 0 }, read).map((c) => c.text)).toEqual([
      "Ready",
      "Done",
      "Ready",
    ]);
  });
  test("evenly spaced numbers carry on as a series, backwards when filling up", () => {
    const read = grid([["", "", "2", "4"]]);
    const down = planFill({ r0: 2, r1: 3, c0: 0, c1: 0 }, { r0: 2, r1: 5, c0: 0, c1: 0 }, read);
    expect(down.map((c) => [c.r, c.text])).toEqual([
      [4, "6"],
      [5, "8"],
    ]);
    const up = planFill({ r0: 2, r1: 3, c0: 0, c1: 0 }, { r0: 0, r1: 3, c0: 0, c1: 0 }, read);
    expect(up.map((c) => [c.r, c.text])).toEqual([
      [0, "-2"],
      [1, "0"],
    ]);
  });
  test("one number repeats rather than counting", () => {
    const read = grid([["3"]]);
    expect(planFill({ r0: 0, r1: 0, c0: 0, c1: 0 }, { r0: 0, r1: 2, c0: 0, c1: 0 }, read).map((c) => c.text)).toEqual(["3", "3"]);
  });
  test("a fill to the right carries each row across", () => {
    const read = grid([["a", "b"], ["x", "y"]]);
    expect(planFill({ r0: 0, r1: 1, c0: 0, c1: 0 }, { r0: 0, r1: 1, c0: 0, c1: 2 }, read)).toEqual([
      { r: 0, c: 1, text: "a" },
      { r: 0, c: 2, text: "a" },
      { r: 1, c: 1, text: "b" },
      { r: 1, c: 2, text: "b" },
    ]);
  });
});

describe("planPaste", () => {
  const bounds = { rows: 10, cols: 4 };
  test("one copied cell fills the whole selection", () => {
    const plan = planPaste({ r0: 1, r1: 3, c0: 0, c1: 1 }, [["P1"]], bounds);
    expect(plan.cells).toHaveLength(6);
    expect(plan.area).toEqual({ r0: 1, r1: 3, c0: 0, c1: 1 });
  });
  test("a selection that is a multiple of the block repeats it", () => {
    const plan = planPaste({ r0: 0, r1: 3, c0: 0, c1: 0 }, [["a"], ["b"]], bounds);
    expect(plan.cells.map((c) => c.text)).toEqual(["a", "b", "a", "b"]);
  });
  test("otherwise the block lands at its own size from the top-left", () => {
    const plan = planPaste({ r0: 0, r1: 0, c0: 0, c1: 0 }, [["a", "b"], ["c", "d"]], bounds);
    expect(plan.cells).toEqual([
      { r: 0, c: 0, text: "a" },
      { r: 0, c: 1, text: "b" },
      { r: 1, c: 0, text: "c" },
      { r: 1, c: 1, text: "d" },
    ]);
  });
  test("cells past the edge are counted", () => {
    const plan = planPaste({ r0: 9, r1: 9, c0: 3, c1: 3 }, [["a", "b"], ["c", "d"]], bounds);
    expect(plan.cells).toEqual([{ r: 9, c: 3, text: "a" }]);
    expect(plan.overflow).toBe(3);
  });
});

describe("parsers", () => {
  const status = parseOption(
    [
      { value: "needs-drawing", label: "Needs drawing" },
      { value: "ready", label: "Ready" },
      { value: "done", label: "Done" },
    ],
    { noun: "a status" },
  );
  test("an option by label, value, or a start that names one", () => {
    expect(status("ready")).toEqual({ value: "ready" });
    expect(status("NEEDS-DRAWING")).toEqual({ value: "needs-drawing" });
    expect(status("draw")).toEqual({ value: "needs-drawing" });
    expect(status("Wood")).toEqual({ error: "“Wood” isn't a status" });
    expect("error" in status("")).toBe(true);
  });
  test("a number ignores currency and commas", () => {
    const price = parseNumber({ min: 0 });
    expect(price("$1,250.50")).toEqual({ value: 1250.5 });
    expect(price("")).toEqual({ value: undefined });
    expect(price("-1")).toEqual({ error: "-1 is below 0" });
    expect(parseNumber({ integer: true })("2.5")).toEqual({ error: "“2.5” isn't a whole number" });
  });
  test("text trims, and can refuse empty", () => {
    expect(parseText()(" bolt ")).toEqual({ value: "bolt" });
    expect("error" in parseText({ required: true })("  ")).toBe(true);
  });
});
