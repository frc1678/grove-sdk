import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { parseTSV, readClipboard, toHTML, toTSV } from "./clipboard";
import type { CellChange } from "./controller";
import { parseNumber, parseOption } from "./parse";
import { useCellGrid } from "./useCellGrid";

afterEach(() => {
  // Drop the selection the last test left, so its grid stops listening.
  fireEvent.pointerDown(document.body);
  cleanup();
  document.querySelectorAll("[data-grid-ui]").forEach((el) => el.remove());
});

type Part = { id: string; number: string; status: string; qty: number | undefined };
const STATUS = [
  { value: "ready", label: "Ready" },
  { value: "done", label: "Done" },
];
const START: Part[] = [
  { id: "a", number: "101", status: "ready", qty: 2 },
  { id: "b", number: "102", status: "done", qty: 8 },
  { id: "c", number: "103", status: "ready", qty: 1 },
];

// A page holding its rows, as a real one does: writes change state, the
// table re-renders.
function Page({ onWrite, hideQty = false }: { onWrite?: (changes: CellChange<Part>[]) => void; hideQty?: boolean }) {
  const [rows, setRows] = useState(START);
  const grid = useCellGrid<Part>({
    rows,
    rowKey: (row) => row.id,
    columns: {
      number: { label: "Part" },
      status: {
        label: "Status",
        copy: (row) => STATUS.find((s) => s.value === row.status)?.label ?? "",
        get: (row) => row.status,
        parse: parseOption(STATUS, { noun: "a status" }),
      },
      qty: { label: "Qty", get: (row) => row.qty, parse: parseNumber({ min: 0 }) },
    },
    write: (changes) => {
      onWrite?.(changes);
      setRows((current) =>
        current.map((row) => {
          const mine = changes.filter((change) => change.row.id === row.id);
          return mine.reduce((next, change) => ({ ...next, [change.key]: change.value }), row);
        }),
      );
    },
  });
  return (
    <table ref={grid.ref}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td {...grid.cell(row, "number")}>{row.number}</td>
            <td {...grid.cell(row, "status")}>
              <button type="button" role="combobox" aria-label={`Status of ${row.number}`}>
                {STATUS.find((s) => s.value === row.status)?.label}
              </button>
            </td>
            <td {...grid.cell(row, "qty")} style={hideQty ? { display: "none" } : undefined} data-testid={`qty-${row.id}`}>
              {row.qty ?? ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const cell = (text: string) => screen.getByText(text).closest("td") as HTMLElement;
const qty = (id: string) => screen.getByTestId(`qty-${id}`);
const press = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(document, { key, ...init });
function clip(type: "copy" | "paste", data: Record<string, string> = {}) {
  const store = { ...data };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (t: string) => store[t] ?? "", setData: (t: string, v: string) => (store[t] = v) },
  });
  document.dispatchEvent(event);
  return { store, prevented: event.defaultPrevented };
}

describe("clipboard formats", () => {
  test("TSV round-trips cells holding tabs, line breaks and quotes", () => {
    const m = [["a\tb", 'say "hi"'], ["two\nlines", ""]];
    expect(parseTSV(toTSV(m))).toEqual(m);
  });
  test("a paste prefers the HTML table Sheets and Excel put beside the text", () => {
    const html = toHTML([["Ready", "3"]]);
    expect(readClipboard({ getData: (t) => (t === "text/html" ? html : "ignored") })).toEqual([["Ready", "3"]]);
    expect(readClipboard({ getData: (t) => (t === "text/plain" ? "1\t2\r\n3\t4\r\n" : "") })).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});

describe("useCellGrid", () => {
  test("a click selects; shift-click makes a range; copy carries both formats", () => {
    render(<Page />);
    fireEvent.pointerDown(cell("101"));
    fireEvent.pointerDown(qty("b"), { shiftKey: true });
    expect(document.querySelectorAll("[data-grid-selected]")).toHaveLength(6);
    const { store, prevented } = clip("copy");
    expect(prevented).toBe(true);
    expect(store["text/plain"]).toBe("101\tReady\t2\n102\tDone\t8");
    expect(store["text/html"]).toContain("<td>Ready</td>");
  });

  test("a click on a control inside a cell keeps the control's click and selects the cell", () => {
    render(<Page />);
    const trigger = screen.getByLabelText("Status of 102");
    const notPrevented = fireEvent.pointerDown(trigger);
    expect(notPrevented).toBe(true);
    expect(clip("copy").store["text/plain"]).toBe("Done");
  });

  test("a paste parses each cell for its column, and names what it skipped", async () => {
    const writes: CellChange<Part>[][] = [];
    render(<Page onWrite={(c) => writes.push(c)} />);
    fireEvent.pointerDown(cell("101"));
    press("ArrowRight");
    clip("paste", { "text/plain": "done\t5\nWood\t7" });
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].map((c) => [c.row.id, c.key, c.value])).toEqual([
      ["a", "status", "done"],
      ["a", "qty", 5],
      ["b", "qty", 7],
    ]);
    expect(await screen.findByText(/Pasted 3 cells · 1 skipped: “Wood” isn't a status/)).toBeDefined();
  });

  test("a read-only column refuses a paste", async () => {
    const write = vi.fn();
    render(<Page onWrite={write} />);
    fireEvent.pointerDown(cell("101"));
    clip("paste", { "text/plain": "999" });
    expect(await screen.findByText(/Nothing changed · 1 skipped: Part is read-only/)).toBeDefined();
    expect(write).not.toHaveBeenCalled();
  });

  test("⌘D fills down from the top row, and ⌘Z puts it back in one write", async () => {
    const writes: CellChange<Part>[][] = [];
    render(<Page onWrite={(c) => writes.push(c)} />);
    fireEvent.pointerDown(qty("a"));
    fireEvent.pointerDown(qty("c"), { shiftKey: true });
    press("d", { metaKey: true });
    await vi.waitFor(() => expect(qty("c").textContent).toBe("2"));
    expect(qty("b").textContent).toBe("2");
    press("z", { metaKey: true });
    await vi.waitFor(() => expect(qty("b").textContent).toBe("8"));
    expect(qty("c").textContent).toBe("1");
    expect(writes).toHaveLength(2);
    expect(writes[1].map((c) => [c.row.id, c.value, c.previous])).toEqual([
      ["b", 8, 2],
      ["c", 1, 2],
    ]);
  });

  test("Delete clears what a column allows to be empty", async () => {
    render(<Page />);
    fireEvent.pointerDown(cell("101"));
    fireEvent.pointerDown(qty("a"), { shiftKey: true });
    press("Delete");
    await vi.waitFor(() => expect(qty("a").textContent).toBe(""));
    expect(await screen.findByText(/Cleared 1 cell · 2 skipped/)).toBeDefined();
  });

  test("a column the layout hides is not part of the grid", () => {
    render(<Page hideQty />);
    fireEvent.pointerDown(cell("101"));
    press("a", { metaKey: true });
    expect(clip("copy").store["text/plain"]).toBe("101\tReady\n102\tDone\n103\tReady");
  });

  test("arrow keys move, shift extends, Escape drops the selection", () => {
    render(<Page />);
    fireEvent.pointerDown(cell("101"));
    press("ArrowDown");
    press("ArrowRight", { shiftKey: true });
    expect(clip("copy").store["text/plain"]).toBe("102\tDone");
    press("Escape"); // the copy's marching ants
    press("Escape");
    expect(clip("copy").prevented).toBe(false);
  });
});
