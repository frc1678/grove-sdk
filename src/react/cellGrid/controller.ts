import { parseTSV, readClipboard, toHTML, toTSV, type Matrix } from "./clipboard";
import { box, CellGridUI, type Box, type GridActions } from "./ui";
import { cellCount, fillTarget, planFill, planPaste, rangeOf, type CellText, type Point, type Range } from "./plan";
import type { ParseResult } from "./parse";

// Spreadsheet behaviour on a table the app already draws: select a cell or
// a range, drag the corner to fill, copy and paste in both directions with
// Sheets, Excel and Notion, one Undo per change.
//
// The app keeps its own markup. Each cell that takes part carries two data
// attributes (`grid.cell(row, key)`), and the grid reads the table's shape
// from the DOM: rows in document order, columns in the order the app
// listed them, minus any its breakpoints hide. That is what lets one hook
// sit on AlignedTable, shadcn's Table and hand-rolled ones alike, across
// several grouped tables under one container, without re-rendering a row
// when the selection moves. The selection itself is drawn on a layer over
// the page (ui.ts), not inside the table.
//
// Clicks follow Mike's rule: a click selects the cell, except a click
// squarely on a control inside it (a dropdown trigger, a link, a
// checkbox), which does what that control does — and still selects the
// cell, so a value just picked can be dragged down. Double-click, Enter or
// F2 opens the cell's own editor.

export type CellGridColumn<Row> = {
  // What a copy of this cell says. Without it, the cell's text as shown.
  copy?: (row: Row) => string;
  // The stored value, for Undo and for spotting numbers in a fill. Needed,
  // with `parse`, for the column to take fills and pastes.
  get?: (row: Row) => unknown;
  // Text → value, or why not. A column without one is read-only to the grid.
  parse?: (text: string, row: Row) => ParseResult<unknown>;
  // Its name in messages ("Status is read-only"). Defaults to the key.
  label?: string;
  // Open this cell's editor. Without it, Enter clicks the cell's first control.
  edit?: (row: Row, cell: HTMLElement) => void;
};

export type CellChange<Row> = { row: Row; key: string; value: unknown; previous: unknown };

export type CellGridOptions<Row> = {
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  // In the order the table shows them.
  columns: Record<string, CellGridColumn<Row>>;
  // Every change of one fill, paste, clear or Undo arrives in one call, so
  // the app can save it in one mutation. A throw is shown as "Not saved".
  write?: (changes: CellChange<Row>[]) => unknown;
};

type Key = { row: string; col: string };
type Batch = { label: string; changes: { rowKey: string; key: string; value: unknown; previous: unknown }[] };
type Drag =
  | { kind: "range" }
  | { kind: "fill"; target: Range | null }
  | { kind: "handle"; which: "start" | "end" }
  | { kind: "tap"; key: Key; x: number; y: number };
type Layout = { rows: string[]; cols: string[]; cell: (r: number, c: number) => HTMLElement | undefined };

// The whole-row cell a phone layout folds every column into (`rowCell`).
export const ROW_CELL = "*";

// Controls inside a cell that keep their own click.
const CONTROL =
  'a[href], button[aria-haspopup], [role="combobox"], [role="checkbox"], [role="switch"], [role="radio"], input, select, textarea, label, [contenteditable="true"], [data-grid-control]';
// What Enter opens when the column names no editor.
const EDITOR = `${CONTROL}, button, [tabindex]:not([tabindex="-1"])`;
// Popups an app opens from a cell (a select's list, a menu): a click in
// one does not drop the selection.
const POPUP = '[role="listbox"], [role="menu"], [role="dialog"], [role="option"], [data-side], [data-grid-ui]';

// Focus is where keys belong to something else: a text field, or a popup
// opened over the grid (a select's list). A dialog the grid itself sits in
// (a history table in a sheet) is not that.
const isTyping = (el: Element | null, grid: HTMLElement | null) => {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true;
  const popup = el.closest(POPUP);
  return popup !== null && !(grid !== null && popup.contains(grid));
};

// Shown, as far as the grid is concerned: neither the cell nor anything
// between it and the grid's container is display: none (a phone's list
// hidden from 768px hides its rows with it).
function shown(el: HTMLElement, root: HTMLElement | null): boolean {
  for (let node: HTMLElement | null = el; node && node !== root?.parentElement; node = node.parentElement) {
    if (getComputedStyle(node).display === "none") return false;
  }
  return true;
}

// What the document's listeners need from whichever grid has a selection.
type Routed = Pick<
  CellGridController<unknown>,
  "key" | "clipboard" | "pointerMove" | "pointerUp" | "clear" | "ownsTarget" | "schedule" | "refresh" | "drag"
>;
let active: Routed | null = null;

export class CellGridController<Row> implements GridActions {
  options: CellGridOptions<Row>;
  el: HTMLElement | null = null;
  anchor: Key | null = null;
  focus: Key | null = null;
  ants: { anchor: Key; focus: Key } | null = null;
  drag: Drag | null = null;
  pointer: "mouse" | "touch" = "mouse";
  undoStack: Batch[] = [];
  redoStack: Batch[] = [];
  private cache: Layout | null = null;
  private ui: CellGridUI | null = null;
  private frame = 0;

  constructor(options: CellGridOptions<Row>) {
    this.options = options;
  }

  // The props for the container (a table, or a div around grouped tables)
  // and for each cell. Stable across renders.
  readonly api = {
    ref: (el: HTMLElement | null) => this.attach(el),
    cell: (row: Row, key: string) => ({ "data-grid-row": this.options.rowKey(row), "data-grid-col": key }),
    rowCell: (row: Row) => ({ "data-grid-row": this.options.rowKey(row), "data-grid-col": ROW_CELL }),
  };

  configure(options: CellGridOptions<Row>) {
    this.options = options;
  }

  // ---------- lifecycle ----------

  attach(el: HTMLElement | null) {
    if (el === this.el) return;
    if (this.el) {
      this.el.removeEventListener("pointerdown", this.onPointerDown);
      this.el.removeEventListener("dblclick", this.onDoubleClick);
    }
    this.el = el;
    this.cache = null;
    if (el) {
      el.addEventListener("pointerdown", this.onPointerDown);
      el.addEventListener("dblclick", this.onDoubleClick);
      installGlobals();
    } else this.destroy();
  }

  destroy() {
    if (active === this) active = null;
    this.paintCells(null, null);
    this.ui?.destroy();
    this.ui = null;
  }

  // After every render: rows may have moved, appeared or gone.
  refresh() {
    this.cache = null;
    if (this.anchor) this.schedule();
  }

  schedule() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.paint();
    });
  }

  // ---------- shape ----------

  layout(): Layout {
    if (this.cache) return this.cache;
    const byRow = new Map<string, Map<string, HTMLElement>>();
    const rows: string[] = [];
    const sample = new Map<string, HTMLElement>();
    for (const td of this.el?.querySelectorAll<HTMLElement>("[data-grid-row][data-grid-col]") ?? []) {
      const row = td.dataset.gridRow as string;
      const col = td.dataset.gridCol as string;
      let cells = byRow.get(row);
      if (!cells) {
        cells = new Map();
        byRow.set(row, cells);
        rows.push(row);
      }
      cells.set(col, td);
      if (!sample.has(col)) sample.set(col, td);
    }
    // A column hides at a breakpoint as a whole, so one cell says whether it shows.
    const cols = [ROW_CELL, ...Object.keys(this.options.columns)].filter((key) => {
      const td = sample.get(key);
      return td !== undefined && shown(td, this.el);
    });
    this.cache = { rows, cols, cell: (r, c) => byRow.get(rows[r])?.get(cols[c]) };
    return this.cache;
  }

  private point(key: Key | null, layout = this.layout()): Point | null {
    if (!key) return null;
    const r = layout.rows.indexOf(key.row);
    const c = layout.cols.indexOf(key.col);
    return r < 0 || c < 0 ? null : { r, c };
  }

  private keyAt(p: Point, layout = this.layout()): Key {
    return { row: layout.rows[p.r], col: layout.cols[p.c] };
  }

  range(): Range | null {
    const layout = this.layout();
    const a = this.point(this.anchor, layout);
    const b = this.point(this.focus, layout);
    return a && b ? rangeOf(a, b) : null;
  }

  private keyOf(el: Element | null): Key | null {
    const td = el?.closest<HTMLElement>("[data-grid-col]");
    if (!td || !this.el?.contains(td) || td.dataset.gridRow === undefined) return null;
    return { row: td.dataset.gridRow, col: td.dataset.gridCol as string };
  }

  private rowOf(rowKey: string): Row | undefined {
    return this.options.rows.find((row) => this.options.rowKey(row) === rowKey);
  }

  // ---------- selection ----------

  select(anchor: Key | null, focus: Key | null = anchor) {
    if (anchor) activate(this);
    this.anchor = anchor;
    this.focus = focus;
    this.paint();
  }

  selectRange(range: Range) {
    const layout = this.layout();
    this.select(this.keyAt({ r: range.r0, c: range.c0 }, layout), this.keyAt({ r: range.r1, c: range.c1 }, layout));
  }

  clear() {
    this.ants = null;
    this.drag = null;
    this.select(null);
  }

  private move(dir: "up" | "down" | "left" | "right", extend: boolean, jump: boolean) {
    const layout = this.layout();
    const from = this.point(extend ? this.focus : this.anchor, layout);
    if (!from) return;
    const dr = dir === "up" ? -1 : dir === "down" ? 1 : 0;
    const dc = dir === "left" ? -1 : dir === "right" ? 1 : 0;
    const last = { r: layout.rows.length - 1, c: layout.cols.length - 1 };
    const to = jump
      ? { r: dr ? (dr > 0 ? last.r : 0) : from.r, c: dc ? (dc > 0 ? last.c : 0) : from.c }
      : { r: Math.min(last.r, Math.max(0, from.r + dr)), c: Math.min(last.c, Math.max(0, from.c + dc)) };
    const key = this.keyAt(to, layout);
    if (extend) this.select(this.anchor, key);
    else this.select(key);
    layout.cell(to.r, to.c)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  // ---------- drawing ----------

  private painted: HTMLElement[] = [];

  private paintCells(range: Range | null, layout: Layout | null) {
    for (const td of this.painted) td.removeAttribute("data-grid-selected");
    this.painted = [];
    if (!range || !layout || cellCount(range) < 2) return;
    for (let r = range.r0; r <= range.r1; r++)
      for (let c = range.c0; c <= range.c1; c++) {
        const td = layout.cell(r, c);
        if (td) {
          td.setAttribute("data-grid-selected", "");
          this.painted.push(td);
        }
      }
  }

  rectOf(range: Range, layout = this.layout()): Box | null {
    const a = layout.cell(range.r0, range.c0) ?? layout.cell(range.r0, range.c1);
    const b = layout.cell(range.r1, range.c1) ?? layout.cell(range.r1, range.c0);
    if (!a || !b) return null;
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    // Hidden since the layout was read (the window narrowed past the
    // table's breakpoint): nothing to draw, rather than a box at 0,0.
    if ((ra.width === 0 && ra.height === 0) || (rb.width === 0 && rb.height === 0)) return null;
    const left = Math.min(ra.left, rb.left);
    const top = Math.min(ra.top, rb.top);
    return box(left, top, Math.max(ra.right, rb.right), Math.max(ra.bottom, rb.bottom));
  }

  paint() {
    const layout = this.layout();
    const range = this.range();
    if (this.anchor && !range) {
      // The selected row is gone (deleted, filtered out).
      this.anchor = this.focus = null;
    }
    this.paintCells(range, layout);
    if (!range && !this.ui) return;
    this.ui ??= new CellGridUI(this, this.el);
    const antsRange = this.ants ? (() => {
      const a = this.point(this.ants.anchor, layout);
      const b = this.point(this.ants.focus, layout);
      return a && b ? rangeOf(a, b) : null;
    })() : null;
    const anchor = this.point(this.anchor, layout);
    this.ui.draw({
      range: range ? this.rectOf(range, layout) : null,
      multi: range !== null && cellCount(range) > 1,
      active: anchor ? this.rectOf(rangeOf(anchor, anchor), layout) : null,
      ants: antsRange ? this.rectOf(antsRange, layout) : null,
      preview: this.drag?.kind === "fill" && this.drag.target ? this.rectOf(this.drag.target, layout) : null,
      clip: clipRect(this.el),
      touch: this.pointer === "touch",
      count: range ? cellCount(range) : 0,
      editing: false,
    });
  }

  // ---------- pointer ----------

  private onPointerDown = (e: PointerEvent) => {
    const target = e.target as Element;
    const key = this.keyOf(target);
    if (!key) return;
    // This grid hears the rest of the gesture (the move, the lift).
    activate(this);
    this.pointer = e.pointerType === "touch" ? "touch" : "mouse";
    const control = target.closest(CONTROL);
    if (control && this.el?.contains(control) && control.closest("[data-grid-col]") !== null) {
      // The control keeps its click; the cell is selected under it.
      this.ants = null;
      this.select(key);
      return;
    }
    if (e.pointerType === "touch") {
      // A tap selects; a drag is the page scrolling.
      this.drag = { kind: "tap", key, x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    // An editor open elsewhere closes, as clicking another cell in Excel does.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== document.body && !focused.closest("[data-grid-col]")?.contains(target)) focused.blur();
    if (e.shiftKey && this.anchor) this.select(this.anchor, key);
    else this.select(key);
    this.drag = { kind: "range" };
  };

  private onDoubleClick = (e: MouseEvent) => {
    const target = e.target as Element;
    if (target.closest(CONTROL)) return;
    const key = this.keyOf(target);
    if (!key) return;
    this.select(key);
    this.edit();
  };

  startFill() {
    this.drag = { kind: "fill", target: null };
  }

  startHandle(which: "start" | "end") {
    const range = this.range();
    if (!range) return;
    // The dots move the corners they sit on.
    this.selectRange(range);
    this.drag = { kind: "handle", which };
  }

  private keyUnder(e: PointerEvent): Key | null {
    return this.keyOf(document.elementFromPoint(e.clientX, e.clientY));
  }

  pointerMove(e: PointerEvent) {
    const drag = this.drag;
    if (!drag) return;
    if (drag.kind === "tap") {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) this.drag = null;
      return;
    }
    const key = this.keyUnder(e);
    autoScroll(this.el, e);
    if (!key) return;
    if (drag.kind === "range") this.select(this.anchor, key);
    else if (drag.kind === "handle") {
      if (drag.which === "start") this.select(key, this.focus);
      else this.select(this.anchor, key);
    } else {
      const range = this.range();
      const p = this.point(key);
      drag.target = range && p ? fillTarget(range, p) : null;
      this.paint();
    }
  }

  pointerUp() {
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;
    if (drag.kind === "tap") {
      this.ants = null;
      this.select(drag.key);
    } else if (drag.kind === "fill") {
      const range = this.range();
      if (range && drag.target) void this.fill(range, drag.target);
      else this.paint();
    }
  }

  // ---------- editing ----------

  edit() {
    const layout = this.layout();
    const p = this.point(this.anchor, layout);
    if (!p || !this.anchor) return;
    this.focus = this.anchor;
    const td = layout.cell(p.r, p.c);
    const row = this.rowOf(this.anchor.row);
    const column = this.options.columns[this.anchor.col];
    if (!td || row === undefined) return;
    if (column?.edit) {
      column.edit(row, td);
      return;
    }
    const control = td.querySelector<HTMLElement>(EDITOR);
    if (!control) {
      this.toast(`${this.labelOf(this.anchor.col)} can't be edited here`, { error: true });
      return;
    }
    control.focus();
    control.click();
  }

  labelOf(key: string) {
    return key === ROW_CELL ? "This row" : (this.options.columns[key]?.label ?? key);
  }

  // ---------- reading ----------

  textOf(r: number, c: number, layout = this.layout()): string {
    const rowKey = layout.rows[r];
    const key = layout.cols[c];
    const row = this.rowOf(rowKey);
    const column = this.options.columns[key];
    if (column?.copy && row !== undefined) return column.copy(row);
    return cellText(layout.cell(r, c));
  }

  matrix(range: Range): Matrix {
    const layout = this.layout();
    const out: Matrix = [];
    for (let r = range.r0; r <= range.r1; r++) {
      const line: string[] = [];
      for (let c = range.c0; c <= range.c1; c++) {
        if (layout.cols[c] === ROW_CELL) {
          // A phone's folded row copies as every column it stands for.
          const row = this.rowOf(layout.rows[r]);
          for (const column of Object.values(this.options.columns)) line.push(column.copy && row !== undefined ? column.copy(row) : "");
        } else line.push(this.textOf(r, c, layout));
      }
      out.push(line);
    }
    return out;
  }

  // ---------- writing ----------

  async commit(cells: CellText[], label: string, area?: Range, skipped: string[] = []) {
    const layout = this.layout();
    const changes: CellChange<Row>[] = [];
    const reasons = [...skipped];
    for (const { r, c, text } of cells) {
      const key = layout.cols[c];
      const column = this.options.columns[key];
      const row = this.rowOf(layout.rows[r]);
      if (row === undefined) continue;
      if (!column?.parse || !column.get || !this.options.write) {
        reasons.push(`${this.labelOf(key)} is read-only`);
        continue;
      }
      const result = column.parse(text, row);
      if ("error" in result) {
        reasons.push(`${result.error} (${this.labelOf(key)})`);
        continue;
      }
      const previous = column.get(row);
      if (Object.is(previous, result.value) || (previous == null && result.value == null)) continue;
      changes.push({ row, key, value: result.value, previous });
    }
    if (area) this.selectRange(area);
    const tail = reasons.length > 0 ? ` · ${reasons.length} skipped: ${reasons[0]}` : "";
    if (changes.length === 0) {
      this.toast(`Nothing changed${tail}`, { error: reasons.length > 0 });
      return;
    }
    const batch: Batch = {
      label,
      changes: changes.map((change) => ({
        rowKey: this.options.rowKey(change.row),
        key: change.key,
        value: change.value,
        previous: change.previous,
      })),
    };
    try {
      await this.options.write?.(changes);
    } catch (error) {
      this.toast(`Not saved: ${error instanceof Error ? error.message : String(error)}`, { error: true });
      return;
    }
    this.undoStack.push(batch);
    this.redoStack = [];
    this.toast(`${label} ${plural(changes.length)}${tail}`, { undo: true });
  }

  async undo(redo = false) {
    const from = redo ? this.redoStack : this.undoStack;
    const to = redo ? this.undoStack : this.redoStack;
    const batch = from.pop();
    if (!batch || !this.options.write) return;
    const changes: CellChange<Row>[] = [];
    for (const change of batch.changes) {
      const row = this.rowOf(change.rowKey);
      if (row === undefined) continue;
      changes.push(
        redo
          ? { row, key: change.key, value: change.value, previous: change.previous }
          : { row, key: change.key, value: change.previous, previous: change.value },
      );
    }
    try {
      await this.options.write(changes);
    } catch (error) {
      from.push(batch);
      this.toast(`Not saved: ${error instanceof Error ? error.message : String(error)}`, { error: true });
      return;
    }
    to.push(batch);
    this.toast(redo ? `Redone: ${plural(changes.length)}` : `Undone: ${plural(changes.length)} put back`);
  }

  fill(source: Range, target: Range) {
    const layout = this.layout();
    const cells = planFill(source, target, (r, c) => {
      const text = this.textOf(r, c, layout);
      const column = this.options.columns[layout.cols[c]];
      const row = this.rowOf(layout.rows[r]);
      const value = column?.get && row !== undefined ? column.get(row) : undefined;
      const number = typeof value === "number" ? value : /^-?\d+(\.\d+)?$/.test(text.trim()) ? Number(text) : undefined;
      return { text, number };
    });
    return this.commit(cells, "Filled", target);
  }

  // Double-clicking the handle: fill down to the last row.
  fillToEnd() {
    const range = this.range();
    if (!range) return;
    const last = this.layout().rows.length - 1;
    if (range.r1 < last) void this.fill(range, { ...range, r1: last });
  }

  fillFrom(dir: "down" | "right") {
    const range = this.range();
    if (!range) return;
    if (dir === "down" ? range.r0 === range.r1 : range.c0 === range.c1) {
      this.toast(
        dir === "down"
          ? "Select the cell to copy and the cells under it, then Fill down"
          : "Select the cell to copy and the cells to its right, then Fill right",
      );
      return;
    }
    void this.fill(dir === "down" ? { ...range, r1: range.r0 } : { ...range, c1: range.c0 }, range);
  }

  clearRange() {
    const range = this.range();
    if (!range) return;
    const cells: CellText[] = [];
    for (let r = range.r0; r <= range.r1; r++) for (let c = range.c0; c <= range.c1; c++) cells.push({ r, c, text: "" });
    return this.commit(cells, "Cleared", range);
  }

  paste(matrix: Matrix) {
    const range = this.range();
    if (!range || matrix.length === 0) return;
    const layout = this.layout();
    const plan = planPaste(range, matrix, { rows: layout.rows.length, cols: layout.cols.length });
    const skipped = plan.overflow > 0 ? [`${plural(plan.overflow)} ran past the table's edge`] : [];
    return this.commit(plan.cells, "Pasted", plan.area, skipped);
  }

  // ---------- clipboard ----------

  copyMatrix(): Matrix | null {
    const range = this.range();
    if (!range || !this.anchor || !this.focus) return null;
    this.ants = { anchor: this.anchor, focus: this.focus };
    this.paint();
    return this.matrix(range);
  }

  // The bar's Copy and Paste, for a phone with no ⌘C.
  async copyToClipboard() {
    const matrix = this.copyMatrix();
    if (!matrix) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([toTSV(matrix)], { type: "text/plain" }),
          "text/html": new Blob([toHTML(matrix)], { type: "text/html" }),
        }),
      ]);
    } catch {
      try {
        await navigator.clipboard.writeText(toTSV(matrix));
      } catch {
        this.toast("This browser wouldn't copy. Try the keyboard shortcut.", { error: true });
        return;
      }
    }
    this.toast(`Copied ${plural(matrix.length * matrix[0].length)}`);
  }

  async pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        await this.paste(parseTSV(text));
        return;
      }
    } catch {
      // Reading the clipboard was refused: paste into a box instead.
    }
    this.ui?.askForPaste();
  }

  toast(message: string, options: { undo?: boolean; error?: boolean } = {}) {
    this.ui ??= new CellGridUI(this, this.el);
    this.ui.toast(message, options);
  }

  // ---------- keyboard and clipboard events (routed from the document) ----------

  key(e: KeyboardEvent) {
    if (!this.anchor || e.defaultPrevented || isTyping(document.activeElement, this.el)) return;
    // A dialog open over the grid (the app's menu) has the keyboard.
    if ([...document.querySelectorAll("dialog[open]")].some((dialog) => !dialog.contains(this.el))) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    const arrows: Record<string, "up" | "down" | "left" | "right"> = {
      arrowup: "up",
      arrowdown: "down",
      arrowleft: "left",
      arrowright: "right",
    };
    const handled = () => e.preventDefault();
    if (arrows[k]) {
      handled();
      this.move(arrows[k], e.shiftKey, mod);
    } else if (mod && k === "z") {
      handled();
      void this.undo(e.shiftKey);
    } else if (mod && k === "y") {
      handled();
      void this.undo(true);
    } else if (mod && k === "a") {
      handled();
      const layout = this.layout();
      this.selectRange({ r0: 0, c0: 0, r1: layout.rows.length - 1, c1: layout.cols.length - 1 });
    } else if (mod && k === "d") {
      handled();
      this.fillFrom("down");
    } else if (mod && k === "r" && !e.shiftKey) {
      handled();
      this.fillFrom("right");
    } else if (mod || e.altKey) return;
    else if (k === "tab") {
      handled();
      this.move(e.shiftKey ? "left" : "right", false, false);
    } else if (k === "enter" || k === "f2") {
      handled();
      this.edit();
    } else if (k === "escape") {
      handled();
      if (this.ants) {
        this.ants = null;
        this.paint();
      } else this.clear();
    } else if (k === "backspace" || k === "delete") {
      handled();
      void this.clearRange();
    }
  }

  clipboard(e: ClipboardEvent) {
    if (!this.anchor || !e.clipboardData || isTyping(document.activeElement, this.el)) return;
    if (e.type !== "paste") {
      // Text the person highlighted themselves copies as text.
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim() !== "") return;
      const matrix = this.copyMatrix();
      if (!matrix) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", toTSV(matrix));
      e.clipboardData.setData("text/html", toHTML(matrix));
      if (e.type === "cut") {
        this.ants = null;
        void this.clearRange();
      } else this.toast(`Copied ${plural(matrix.length * matrix[0].length)}`);
      return;
    }
    const matrix = readClipboard(e.clipboardData);
    if (!matrix) return;
    e.preventDefault();
    void this.paste(matrix);
  }

  ownsTarget(target: Element) {
    return this.el?.contains(target) || target.closest(POPUP) !== null;
  }
}

const plural = (n: number) => `${n} cell${n === 1 ? "" : "s"}`;

function cellText(td: HTMLElement | undefined): string {
  if (!td) return "";
  const text = typeof td.innerText === "string" ? td.innerText : (td.textContent ?? "");
  return text.replace(/\s+/g, " ").trim();
}

// The part of the page the table can actually be seen in: the viewport,
// cut down by every scrolling or clipping box around it.
function clipRect(el: HTMLElement | null): Box {
  let left = 0;
  let top = 0;
  let right = window.innerWidth;
  let bottom = window.innerHeight;
  for (let node = el?.parentElement ?? null; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.overflowX !== "visible" || style.overflowY !== "visible") {
      const box = node.getBoundingClientRect();
      left = Math.max(left, box.left);
      top = Math.max(top, box.top);
      right = Math.min(right, box.right);
      bottom = Math.min(bottom, box.bottom);
    }
  }
  return box(left, top, Math.max(left, right), Math.max(top, bottom));
}

// Dragging past the side of a table that scrolls sideways scrolls it.
function autoScroll(el: HTMLElement | null, e: PointerEvent) {
  for (let node = el; node; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth && /(auto|scroll)/.test(getComputedStyle(node).overflowX)) {
      const box = node.getBoundingClientRect();
      if (e.clientX > box.right - 32) node.scrollLeft += 16;
      else if (e.clientX < box.left + 32) node.scrollLeft -= 16;
      return;
    }
  }
}

function activate(grid: Routed) {
  if (active && active !== grid) active.clear();
  active = grid;
}

// One set of document listeners for every grid on the page, routed to the
// one with a selection.
let installed = false;
function installGlobals() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("keydown", (e) => active?.key(e));
  for (const type of ["copy", "cut", "paste"] as const) document.addEventListener(type, (e) => active?.clipboard(e));
  window.addEventListener("pointermove", (e) => active?.pointerMove(e));
  window.addEventListener("pointerup", () => active?.pointerUp());
  window.addEventListener("pointercancel", () => {
    if (active) active.drag = null;
  });
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (active && e.target instanceof Element && !active.ownsTarget(e.target)) active.clear();
    },
    true,
  );
  const repaint = () => active?.schedule();
  window.addEventListener("scroll", repaint, { capture: true, passive: true });
  window.addEventListener("resize", () => {
    if (!active) return;
    active.refresh();
  });
}
