import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { GroveVersionBadge } from "./VersionBadge";

afterEach(cleanup);

test("shows the version it was given", () => {
  render(<GroveVersionBadge version="V03.07" />);
  expect(screen.getByText("V03.07")).toBeDefined();
});

test("explains the scheme on hover rather than in the header", () => {
  // The badge has to stay small enough to ignore, so the explanation of
  // what the two halves mean lives in the tooltip.
  render(<GroveVersionBadge version="V03.07" />);
  expect(screen.getByTitle(/tutorial changes/i)).toBeDefined();
});

test("renders nothing when the build injected no version", () => {
  // define missing, or an app that has not wired it up yet: an empty
  // string is the shape that reaches here, and an empty badge would leave
  // a stray gap in the flex header.
  const { container } = render(<GroveVersionBadge version="" />);
  expect(container.innerHTML).toBe("");
});
