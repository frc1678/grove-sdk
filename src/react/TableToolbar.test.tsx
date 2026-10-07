import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { TableToolbar, type ToolbarSort } from "./TableToolbar";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(cleanup);

const STATUS = [
  { value: "ready", label: "Ready" },
  { value: "cutting", label: "In progress" },
  { value: "made", label: "Made" },
];
const ROBOTS = [
  { value: "r1", label: "27x Alpha" },
  { value: "r2", label: "26z Beta" },
];

// A page holding its own state, as a real one does.
function Page({ initialStatus = [] as string[] }) {
  const [status, setStatus] = useState(initialStatus);
  const [robot, setRobot] = useState<string[]>([]);
  const [sort, setSort] = useState<ToolbarSort["value"]>({ key: "priority", dir: 1 });
  return (
    <>
      <TableToolbar
        search={{ value: "", onChange: () => {} }}
        filters={[
          { key: "status", label: "Status", options: STATUS, values: status, onChange: setStatus },
          { key: "robot", label: "Robot", options: ROBOTS, values: robot, onChange: setRobot, single: true },
        ]}
        sort={{
          options: [
            { key: "priority", label: "Priority order" },
            { key: "number", label: "Part number" },
          ],
          value: sort,
          onChange: setSort,
          defaultKey: "priority",
        }}
        count="3 of 9 parts"
      />
      <output data-testid="state">{JSON.stringify({ status, robot, sort })}</output>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent ?? "{}");

describe("TableToolbar", () => {
  test("nothing active, no chip row", () => {
    render(<Page />);
    expect(screen.queryByRole("group", { name: "Active filters" })).toBeNull();
  });

  test("an active filter is a chip naming its values, and its ✕ clears it", () => {
    render(<Page initialStatus={["ready", "cutting"]} />);
    const chips = screen.getByRole("group", { name: "Active filters" });
    expect(within(chips).getByText("Ready, In progress")).toBeDefined();
    fireEvent.click(screen.getByLabelText("Clear Status"));
    expect(state().status).toEqual([]);
  });

  test("more than two values are summarised", () => {
    render(<Page initialStatus={["ready", "cutting", "made"]} />);
    expect(within(screen.getByRole("group", { name: "Active filters" })).getByText("Ready +2")).toBeDefined();
  });

  test("the filter panel ticks several values on a field, one on a single field", () => {
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    const panel = screen.getByRole("dialog", { name: "Filter" });
    fireEvent.click(within(panel).getByRole("button", { name: /Status/ }));
    fireEvent.click(within(panel).getByRole("button", { name: "Ready" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Made" }));
    expect(state().status).toEqual(["ready", "made"]);
    fireEvent.click(within(panel).getByRole("button", { name: "Made" }));
    expect(state().status).toEqual(["ready"]);

    fireEvent.click(within(panel).getByRole("button", { name: /Robot/ }));
    fireEvent.click(within(panel).getByRole("button", { name: "27x Alpha" }));
    fireEvent.click(within(panel).getByRole("button", { name: "26z Beta" }));
    expect(state().robot).toEqual(["r2"]);
  });

  test("the Filter button counts active fields", () => {
    render(<Page initialStatus={["ready"]} />);
    expect(within(screen.getByRole("button", { name: /Filter/ })).getByText("1")).toBeDefined();
  });

  test("Clear all in the panel clears every field", () => {
    render(<Page initialStatus={["ready"]} />);
    fireEvent.click(screen.getByRole("button", { name: /Filter/ }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Filter" })).getByText("Clear all"));
    expect(state().status).toEqual([]);
  });

  test("sorting by the same column again reverses it, and the chip puts the usual order back", () => {
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Sort" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Part number" }));
    expect(state().sort).toEqual({ key: "number", dir: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Sort" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Part number/ }));
    expect(state().sort).toEqual({ key: "number", dir: -1 });
    fireEvent.click(screen.getByLabelText("Back to the usual order"));
    expect(state().sort).toEqual({ key: "priority", dir: 1 });
  });

  test("a custom field shows the page's own controls, and its chip clears through the page", () => {
    let cleared = 0;
    render(
      <TableToolbar
        filters={[
          {
            key: "requested",
            label: "Requested",
            custom: { content: <input aria-label="From" />, summary: "since Oct 1", clear: () => (cleared += 1) },
          },
        ]}
      />,
    );
    const chips = screen.getByRole("group", { name: "Active filters" });
    expect(within(chips).getByText("since Oct 1")).toBeDefined();
    fireEvent.click(within(chips).getByLabelText("Clear Requested"));
    expect(cleared).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: /Filter/ }));
    expect(within(screen.getByRole("dialog", { name: "Filter" })).getByLabelText("From")).toBeDefined();
  });

  test("a page whose usual order runs newest first has no sort chip in that order", () => {
    const sort = (dir: 1 | -1): ToolbarSort => ({
      options: [{ key: "requested", label: "Requested" }],
      value: { key: "requested", dir },
      onChange: () => {},
      defaultKey: "requested",
      defaultDir: -1,
    });
    const { rerender } = render(<TableToolbar sort={sort(-1)} />);
    expect(screen.queryByRole("group", { name: "Active filters" })).toBeNull();
    rerender(<TableToolbar sort={sort(1)} />);
    expect(screen.getByLabelText("Back to the usual order")).toBeDefined();
  });

  test("a page that clears its filters in one go is asked to, instead of each filter in turn", () => {
    let all = 0;
    const each: string[] = [];
    render(
      <TableToolbar
        onClearAll={() => (all += 1)}
        filters={[
          { key: "a", label: "A", options: STATUS, values: ["ready"], onChange: () => each.push("a") },
          { key: "b", label: "B", options: STATUS, values: ["made"], onChange: () => each.push("b") },
        ]}
      />,
    );
    fireEvent.click(within(screen.getByRole("group", { name: "Active filters" })).getByText("Clear all"));
    expect(all).toBe(1);
    expect(each).toEqual([]);
  });
});
