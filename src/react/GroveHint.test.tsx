import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { GroveHint } from "./GroveHint";

afterEach(cleanup);

test("the explanation opens on a tap and closes on a tap elsewhere or Escape", () => {
  render(
    <div>
      <GroveHint label="What does Banked mean?">Extra meetings you can spend later.</GroveHint>
      <p>elsewhere</p>
    </div>,
  );
  const button = screen.getByRole("button", { name: "What does Banked mean?" });
  expect(screen.queryByRole("note")).toBeNull();

  fireEvent.click(button);
  expect(screen.getByRole("note").textContent).toBe("Extra meetings you can spend later.");
  expect(button.getAttribute("aria-expanded")).toBe("true");

  fireEvent.pointerDown(screen.getByText("elsewhere"));
  expect(screen.queryByRole("note")).toBeNull();

  fireEvent.click(button);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("note")).toBeNull();
});
