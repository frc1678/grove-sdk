import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { GroveAvatar, initials } from "./GroveAvatar";

afterEach(cleanup);

test("initials are the first and last word", () => {
  expect(initials("Ada Whitfield")).toBe("AW");
  expect(initials("  grace  van der lindqvist ")).toBe("GL");
  expect(initials("Prince")).toBe("P");
  expect(initials("")).toBe("?");
});

test("shows the photo, and initials when there is none", () => {
  const { container, rerender } = render(
    <GroveAvatar name="Ada Whitfield" src="https://avatars.slack-edge.com/a.png" />,
  );
  expect(container.querySelector("img")?.getAttribute("src")).toBe(
    "https://avatars.slack-edge.com/a.png",
  );
  rerender(<GroveAvatar name="Ada Whitfield" />);
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toBe("AW");
});

// Slack retires a photo's URL when the person changes it; until the next
// sync brings the new one, the initials stand in.
test("falls back to initials when the photo fails, and retries a new URL", () => {
  const { container, rerender } = render(
    <GroveAvatar name="Ada Whitfield" src="https://avatars.slack-edge.com/old.png" />,
  );
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toBe("AW");

  rerender(<GroveAvatar name="Ada Whitfield" src="https://avatars.slack-edge.com/new.png" />);
  expect(container.querySelector("img")?.getAttribute("src")).toBe(
    "https://avatars.slack-edge.com/new.png",
  );
});
