import { act, render } from "@testing-library/react";
import type { ConvexReactClient } from "convex/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GroveUsage, useGroveEvent } from "./GroveUsage";

function fakeClient() {
  const mutation = vi.fn(async () => ({ recorded: 1 }));
  return { client: { mutation } as unknown as ConvexReactClient, mutation };
}

function Button() {
  const track = useGroveEvent();
  return <button onClick={() => track("mission.created")}>Make</button>;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("GroveUsage", () => {
  test("records nothing until someone is signed in", async () => {
    const { client, mutation } = fakeClient();
    render(<GroveUsage client={client} app="chime" enabled={false} />);
    await act(() => vi.advanceTimersByTimeAsync(31_000));
    expect(mutation).not.toHaveBeenCalled();
  });

  test("sends page views and useGroveEvent calls to the Grove's usage.record", async () => {
    const { client, mutation } = fakeClient();
    const view = render(
      <>
        <GroveUsage client={client} app="chime" enabled />
        <Button />
      </>,
    );
    act(() => view.getByText("Make").click());
    await act(() => vi.advanceTimersByTimeAsync(31_000));
    expect(mutation).toHaveBeenCalledTimes(1);
    const [, batch] = mutation.mock.calls[0] as unknown as [unknown, { app: string; events: Array<{ name: string }> }];
    expect(batch.app).toBe("chime");
    expect(batch.events.map((event) => event.name)).toEqual(["page_view", "mission.created"]);
    view.unmount();
  });
});
