import type { Matrix } from "./clipboard";

// The arithmetic of a fill or a paste, apart from any DOM: which cells get
// which text. The grid then runs each text through its column's `parse`,
// so a fill can never store something the column would refuse if typed.

export type Point = { r: number; c: number };
export type Range = { r0: number; c0: number; r1: number; c1: number };
export type CellText = { r: number; c: number; text: string };

export function rangeOf(a: Point, b: Point): Range {
  return { r0: Math.min(a.r, b.r), r1: Math.max(a.r, b.r), c0: Math.min(a.c, b.c), c1: Math.max(a.c, b.c) };
}

export const cellCount = (range: Range) => (range.r1 - range.r0 + 1) * (range.c1 - range.c0 + 1);

const mod = (n: number, m: number) => ((n % m) + m) % m;

// Where dragging the fill handle from `source` to the cell under the
// pointer fills: the source stretched along whichever axis the pointer has
// gone further past it, as Excel does. Null while the pointer is still
// inside the source.
export function fillTarget(source: Range, pointer: Point): Range | null {
  const down = pointer.r - source.r1;
  const up = source.r0 - pointer.r;
  const right = pointer.c - source.c1;
  const left = source.c0 - pointer.c;
  const best = Math.max(down, up, right, left);
  if (best <= 0) return null;
  if (best === down) return { ...source, r1: pointer.r };
  if (best === up) return { ...source, r0: pointer.r };
  if (best === right) return { ...source, c1: pointer.c };
  return { ...source, c0: pointer.c };
}

// What one cell holds, for a fill: its text, and its number when it is one.
export type SourceCell = { text: string; number?: number };

// Fill `target` (the source stretched one way) from `source`. Each line
// along the fill repeats the source's cells in order; two or more evenly
// spaced numbers carry on as a series instead (2, 4 → 6, 8), backwards
// when filling up or left.
export function planFill(source: Range, target: Range, read: (r: number, c: number) => SourceCell): CellText[] {
  const vertical = target.r0 !== source.r0 || target.r1 !== source.r1;
  const out: CellText[] = [];
  const [lineFrom, lineTo] = vertical ? [source.c0, source.c1] : [source.r0, source.r1];
  const [s0, s1] = vertical ? [source.r0, source.r1] : [source.c0, source.c1];
  const [t0, t1] = vertical ? [target.r0, target.r1] : [target.c0, target.c1];
  for (let line = lineFrom; line <= lineTo; line++) {
    const cells: SourceCell[] = [];
    for (let i = s0; i <= s1; i++) cells.push(vertical ? read(i, line) : read(line, i));
    const numbers = cells.map((cell) => cell.number);
    const step = numbers.length > 1 && numbers[0] !== undefined && numbers[1] !== undefined ? numbers[1] - numbers[0] : 0;
    const series =
      numbers.length > 1 &&
      numbers.every((n, i) => n !== undefined && (i === 0 || Math.abs(n - (numbers[i - 1] as number) - step) < 1e-9));
    for (let at = t0; at <= t1; at++) {
      if (at >= s0 && at <= s1) continue;
      const offset = at - s0;
      const text = series
        ? String(Number(((numbers[0] as number) + step * offset).toFixed(9)))
        : cells[mod(offset, cells.length)].text;
      out.push(vertical ? { r: at, c: line, text } : { r: line, c: at, text });
    }
  }
  return out;
}

// Paste `matrix` with its top-left at the selection's. One copied cell
// fills the whole selection; a selection that is an exact multiple of the
// copied block repeats it (Excel's tiling); otherwise the block lands at
// its own size. Cells past the table's edge are counted, not dropped
// silently.
export function planPaste(
  selection: Range,
  matrix: Matrix,
  bounds: { rows: number; cols: number },
): { cells: CellText[]; overflow: number; area: Range } {
  const height = matrix.length;
  const width = Math.max(0, ...matrix.map((row) => row.length));
  const selHeight = selection.r1 - selection.r0 + 1;
  const selWidth = selection.c1 - selection.c0 + 1;
  let rows = height;
  let cols = width;
  if ((height === 1 && width === 1) || (selHeight % height === 0 && selWidth % width === 0)) {
    rows = Math.max(height, selHeight);
    cols = Math.max(width, selWidth);
  }
  const cells: CellText[] = [];
  let overflow = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const r = selection.r0 + i;
      const c = selection.c0 + j;
      if (r >= bounds.rows || c >= bounds.cols) {
        overflow++;
        continue;
      }
      cells.push({ r, c, text: matrix[i % height][j % width] ?? "" });
    }
  }
  return {
    cells,
    overflow,
    area: {
      r0: selection.r0,
      c0: selection.c0,
      r1: Math.min(bounds.rows - 1, selection.r0 + rows - 1),
      c1: Math.min(bounds.cols - 1, selection.c0 + cols - 1),
    },
  };
}
