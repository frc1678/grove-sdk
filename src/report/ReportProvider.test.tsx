import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ConvexReactClient } from "convex/react";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { ReportProblemButton, ReportProvider, useReportContext } from "./ReportProvider";
import { captureViewport, flattenAnnotated } from "./screenshot";
import { captureGroveFeedback, initGroveSentry, setGroveSentryUser } from "./sentry";

// The browser-only halves — rendering the DOM to pixels, and Sentry — are
// replaced; everything between the button and the Grove's mutations is real.
vi.mock("./screenshot", () => ({
  STROKE_COLOR: "#ef4444",
  captureViewport: vi.fn(),
  flattenAnnotated: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
}));
vi.mock("./sentry", () => ({
  initGroveSentry: vi.fn(async () => {}),
  setGroveSentryUser: vi.fn(),
  captureGroveFeedback: vi.fn(),
}));

beforeAll(() => {
  // jsdom has <dialog> but not its methods.
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
  vi.unstubAllGlobals();
});

function fakeClient({
  sentryDsn = null,
  submit = async () => ({ id: "report-1" }),
}: {
  sentryDsn?: string | null;
  submit?: (args: unknown) => Promise<unknown>;
} = {}) {
  const calls: { name: string; args: unknown }[] = [];
  const client = {
    query: vi.fn(async () => ({ sentryDsn })),
    mutation: vi.fn(async (ref: never, args: unknown) => {
      const name = getFunctionName(ref);
      calls.push({ name, args });
      if (name === "feedback:generateUploadUrl") return "https://upload.example/abc";
      if (name === "feedback:submit") return await submit(args);
      throw new Error(`unexpected ${name}`);
    }),
  };
  return { client: client as unknown as ConvexReactClient, calls };
}

function MatchContext() {
  useReportContext(() => ({ matchId: "m42", replayLog: [1, 2, 3] }));
  return null;
}

const screenshot = {
  width: 750,
  height: 1624,
  toDataURL: () => "data:image/png;base64,AAAA",
} as unknown as HTMLCanvasElement;

beforeEach(() => {
  vi.mocked(captureViewport).mockReset();
  vi.mocked(initGroveSentry).mockClear();
  vi.mocked(setGroveSentryUser).mockClear();
  vi.mocked(captureGroveFeedback).mockReset().mockResolvedValue("sentry-event-1");
  vi.mocked(flattenAnnotated).mockClear();
});

describe("ReportProblemButton", () => {
  test("renders nothing outside a report provider", () => {
    const { container } = render(<ReportProblemButton />);
    expect(container.innerHTML).toBe("");
  });
});

describe("ReportProvider", () => {
  test("sends the screenshot, the text, and the context in the Grove's shape", async () => {
    vi.mocked(captureViewport).mockResolvedValue(screenshot);
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ storageId: "storage-1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { client, calls } = fakeClient();
    render(
      <ReportProvider client={client} app="sim" version="V03.07" user={{ id: "u1", role: "student" }}>
        <MatchContext />
        <ReportProblemButton />
      </ReportProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    const text = await screen.findByLabelText("What happened?");
    expect(screen.getByAltText("Screenshot of the page")).toBeDefined();
    expect(screen.getByRole("button", { name: "Bug" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Idea" }));
    fireEvent.change(text, { target: { value: "  The score froze at 42  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Sent — thanks")).toBeDefined();

    const [uploadUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(uploadUrl).toBe("https://upload.example/abc");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("image/png");

    const submitted = calls.find((call) => call.name === "feedback:submit")!.args as Record<
      string,
      unknown
    > & { context: Record<string, unknown> };
    expect(Object.keys(submitted).sort()).toEqual(
      ["app", "context", "kind", "screenshot", "sentryEventId", "text"],
    );
    expect(submitted).toMatchObject({
      app: "sim",
      kind: "idea",
      text: "The score froze at 42",
      screenshot: "storage-1",
      sentryEventId: "sentry-event-1",
    });
    expect(submitted.context).toMatchObject({
      url: window.location.href,
      version: "V03.07",
      viewport: { width: window.innerWidth, height: window.innerHeight },
      consoleErrors: expect.any(Array),
    });
    expect(JSON.parse(submitted.context.extra as string)).toEqual({
      matchId: "m42",
      replayLog: [1, 2, 3],
    });
    // Sentry gets the whole context, extra included, as an attachment.
    const sentryCall = vi.mocked(captureGroveFeedback).mock.calls[0][0];
    expect(sentryCall).toMatchObject({ message: "The score froze at 42", app: "sim", kind: "idea" });
    expect(JSON.parse(sentryCall.contextJson).extra.matchId).toBe("m42");
  });

  test("Alt+Shift+R opens it, and a failed capture still opens it", async () => {
    vi.mocked(captureViewport).mockRejectedValue(new Error("tainted canvas"));
    // Sentry not running here: no DSN, so no event id.
    vi.mocked(captureGroveFeedback).mockResolvedValue(undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client, calls } = fakeClient();
    render(
      <ReportProvider client={client} app="forms">
        <p>page</p>
      </ReportProvider>,
    );

    // What a Mac sends: Option turns the key into "®", the code stays KeyR.
    fireEvent.keyDown(window, { key: "®", code: "KeyR", altKey: true, shiftKey: true });
    expect(await screen.findByText(/could not be captured/)).toBeDefined();
    fireEvent.change(screen.getByLabelText("What happened?"), { target: { value: "broken" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Sent — thanks");

    // No screenshot means no upload, and neither optional id is sent.
    expect(calls.map((call) => call.name)).toEqual(["feedback:submit"]);
    expect(calls[0].args).not.toHaveProperty("screenshot");
    expect(calls[0].args).not.toHaveProperty("sentryEventId");
    warn.mockRestore();
  });

  test("a refusal from the Grove is shown and the text is kept", async () => {
    vi.mocked(captureViewport).mockRejectedValue(new Error("no"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = fakeClient({
      submit: async () => {
        throw new ConvexError("Too many reports — try again in a minute");
      },
    });
    render(
      <ReportProvider client={client} app="chime">
        <ReportProblemButton />
      </ReportProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    const text = await screen.findByLabelText("What happened?");
    fireEvent.change(text, { target: { value: "It crashed" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Too many reports — try again in a minute",
    );
    expect((screen.getByLabelText("What happened?") as HTMLTextAreaElement).value).toBe("It crashed");
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", false);
    warn.mockRestore();
  });

  test("Cancel closes without sending", async () => {
    vi.mocked(captureViewport).mockResolvedValue(screenshot);
    const { client, calls } = fakeClient();
    render(
      <ReportProvider client={client} app="chime">
        <ReportProblemButton />
      </ReportProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    await screen.findByLabelText("What happened?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("What happened?")).toBeNull();
    expect(calls).toEqual([]);
  });

  test("starts Sentry only when the Grove has a DSN, and tags the user", async () => {
    const without = fakeClient();
    const { unmount } = render(
      <ReportProvider client={without.client} app="sim" user={null}>
        <p />
      </ReportProvider>,
    );
    await act(async () => {});
    expect(initGroveSentry).not.toHaveBeenCalled();
    expect(setGroveSentryUser).toHaveBeenLastCalledWith(null);
    unmount();

    const withDsn = fakeClient({ sentryDsn: "https://key@sentry.example/1" });
    render(
      <ReportProvider client={withDsn.client} app="sim" version="V03.07" user={{ id: "u1", role: "coach" }}>
        <p />
      </ReportProvider>,
    );
    await waitFor(() =>
      expect(initGroveSentry).toHaveBeenCalledWith({
        dsn: "https://key@sentry.example/1",
        app: "sim",
        version: "V03.07",
        environment: "test",
      }),
    );
    expect(setGroveSentryUser).toHaveBeenLastCalledWith({ id: "u1", role: "coach" });
  });
});
