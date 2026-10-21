import { useEffect, useRef } from "react";
import { CellGridController, type CellGridOptions } from "./controller";

// Spreadsheet selection, fill and copy/paste for a table the app draws.
//
//   const grid = useCellGrid({ rows, rowKey, columns, write })
//   <table ref={grid.ref}> … <td {...grid.cell(row, "status")}>
//
// Put `ref` on the table, or on a div around several grouped tables to
// select across them. Columns are listed in the order the table shows
// them; a column with `get` and `parse` takes fills and pastes, any other
// only copies. See controller.ts for the behaviour.
export function useCellGrid<Row>(options: CellGridOptions<Row>) {
  const ref = useRef<CellGridController<Row> | null>(null);
  ref.current ??= new CellGridController(options);
  const grid = ref.current;
  grid.configure(options);
  useEffect(() => () => grid.destroy(), [grid]);
  // Rows re-render, re-sort and arrive from Convex: re-read the table's
  // shape and keep the selection on the same cells.
  useEffect(() => grid.refresh());
  return grid.api;
}

export type CellGrid<Row> = ReturnType<typeof useCellGrid<Row>>;
