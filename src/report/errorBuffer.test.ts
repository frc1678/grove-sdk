// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  describe as describeValue,
  installErrorBuffer,
  MAX_ERRORS,
  MAX_MESSAGE_LENGTH,
  recentErrors,
  resetErrorBufferForTests,
} from "./errorBuffer";

// Silenced before the install, so the wrapper forwards to the mock and the
// test output stays clean — and so the test can see it still forwards.
const original = vi.spyOn(console, "error").mockImplementation(() => {});
installErrorBuffer();

beforeEach(() => {
  resetErrorBufferForTests();
  original.mockClear();
});

describe("error buffer", () => {
  test("records console.error and still logs it", () => {
    console.error("[CONVEX Q(tasks:list)] Server Error", { code: 1 });
    expect(recentErrors()).toEqual([
      { at: expect.any(Number), message: '[CONVEX Q(tasks:list)] Server Error {"code":1}' },
    ]);
    expect(original).toHaveBeenCalledWith("[CONVEX Q(tasks:list)] Server Error", { code: 1 });
  });

  test("records uncaught errors and unhandled rejections", () => {
    window.dispatchEvent(new ErrorEvent("error", { error: new TypeError("x is undefined") }));
    const rejection = Object.assign(new Event("unhandledrejection"), { reason: "timed out" });
    window.dispatchEvent(rejection);
    expect(recentErrors().map((entry) => entry.message.split("\n")[0])).toEqual([
      "TypeError: x is undefined",
      "Unhandled rejection: timed out",
    ]);
  });

  test("installing twice does not record everything twice", () => {
    installErrorBuffer();
    console.error("once");
    expect(recentErrors()).toHaveLength(1);
  });

  test("keeps only the newest entries, each capped", () => {
    for (let index = 0; index < MAX_ERRORS + 5; index += 1) console.error(`error ${index}`);
    console.error("y".repeat(MAX_MESSAGE_LENGTH + 100));
    const errors = recentErrors();
    expect(errors).toHaveLength(MAX_ERRORS);
    expect(errors[0].message).toBe("error 6");
    expect(errors.at(-1)!.message).toHaveLength(MAX_MESSAGE_LENGTH);
  });
});

describe("describe", () => {
  test("an Error is its name, message, and the top of its stack", () => {
    const error = new RangeError("bad index");
    error.stack = [
      "RangeError: bad index",
      "    at pick (app.js:1:1)",
      "    at render (app.js:2:1)",
      "    at react (react.js:3:1)",
      "    at deeper (react.js:4:1)",
    ].join("\n");
    expect(describeValue(error)).toBe(
      "RangeError: bad index\nat pick (app.js:1:1)\nat render (app.js:2:1)\nat react (react.js:3:1)",
    );
  });

  test("keeps Firefox-style frames and survives what JSON cannot encode", () => {
    const error = new Error("boom");
    error.stack = "pick@https://app/x.js:10:5\nrender@https://app/x.js:20:1";
    expect(describeValue(error)).toBe(
      "Error: boom\npick@https://app/x.js:10:5\nrender@https://app/x.js:20:1",
    );
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(describeValue(cyclic)).toBe("[object Object]");
    expect(describeValue(undefined)).toBe("undefined");
  });
});
