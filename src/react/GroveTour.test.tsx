import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GroveTour, type TourStep } from "./GroveTour";

beforeEach(() => {
  vi.useFakeTimers();
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const steps: TourStep[] = [
  { title: "Welcome", body: "first" },
  { title: "The queue", body: "second", route: "/queue", target: '[data-tour="queue"]' },
  { title: "Filter", body: "third", target: ['[data-tour="missing"]', '[data-tour="toolbar-filter"]'] },
];

function mount(pathname = "/", onFinish = () => {}) {
  const navigate = vi.fn();
  render(<GroveTour steps={steps} appName="Parts" pathname={pathname} navigate={navigate} onFinish={onFinish} />);
  // Let the step look for its target.
  act(() => {
    vi.advanceTimersByTime(3000);
  });
  return navigate;
}

const title = () => screen.getByRole("heading", { level: 2 }).textContent;

describe("GroveTour", () => {
  test("starts at the first step and counts them", () => {
    mount();
    expect(title()).toBe("Welcome");
    expect(screen.getByText("Step 1 of 3")).toBeDefined();
  });

  test("Next and Back move through the steps", () => {
    mount();
    fireEvent.click(screen.getByText("Next"));
    expect(title()).toBe("The queue");
    fireEvent.click(screen.getByText("Back"));
    expect(title()).toBe("Welcome");
  });

  test("a step on another page goes there first", () => {
    const navigate = mount("/");
    fireEvent.click(screen.getByText("Next"));
    expect(navigate).toHaveBeenCalledWith("/queue");
  });

  test("a step already on its page does not navigate again", () => {
    const navigate = mount("/queue");
    fireEvent.click(screen.getByText("Next"));
    expect(navigate).not.toHaveBeenCalled();
  });

  test("the last step's button is Done, and it finishes the tour", () => {
    const onFinish = vi.fn();
    mount("/", onFinish);
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Done")).toBeDefined();
    fireEvent.click(screen.getByText("Done"));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  test("Skip finishes it from any step", () => {
    const onFinish = vi.fn();
    mount("/", onFinish);
    fireEvent.click(screen.getByText("Skip tour"));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  test("the arrow keys step too", () => {
    mount();
    fireEvent.keyDown(screen.getByRole("dialog", { hidden: true }), { key: "ArrowRight" });
    expect(title()).toBe("The queue");
    fireEvent.keyDown(screen.getByRole("dialog", { hidden: true }), { key: "ArrowLeft" });
    expect(title()).toBe("Welcome");
  });

  test("a target wider than the screen is ringed only where it shows", () => {
    Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 375 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 812 });
    const wide = document.createElement("div");
    wide.setAttribute("data-tour", "queue");
    wide.getBoundingClientRect = () =>
      ({ top: 100, left: -40, right: 1560, bottom: 148, width: 1600, height: 48 }) as DOMRect;
    wide.scrollIntoView = () => {};
    document.body.append(wide);
    try {
      mount("/queue");
      fireEvent.click(screen.getByText("Next"));
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      const ring = document.querySelector<HTMLElement>(".ring-2");
      expect(ring?.style.left).toBe("0px");
      expect(ring?.style.width).toBe("375px");
      expect(ring?.style.top).toBe("94px");
    } finally {
      wide.remove();
    }
  });
});
