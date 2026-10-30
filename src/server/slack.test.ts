import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  groveSlack,
  sendSlackDm,
  slackApi,
  SlackApiError,
  slackMention,
  slackSender,
} from "./slack";

type Call = { method: string; body: Record<string, unknown> };

// A fake Slack: records every call and answers from `replies`, else ok.
function fakeSlack(replies: Record<string, (body: Record<string, unknown>) => unknown> = {}) {
  const calls: Call[] = [];
  let next = 100;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const method = url.replace("https://slack.com/api/", "");
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      calls.push({ method, body });
      const reply = replies[method]?.(body) ?? {
        ok: true,
        channel: method === "conversations.open" ? { id: "D1" } : body.channel,
        ts: method === "chat.update" ? body.ts : `${next++}.0`,
      };
      return Response.json(reply);
    }),
  );
  return calls;
}

const chime = { name: "Chime", slug: "chime" };

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("GROVE_SITE_URL", "https://grove.convex.site/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("slackSender", () => {
  test("the app's name and the PNG groveHomeScreen serves under the Grove", () => {
    expect(slackSender(chime)).toEqual({
      username: "Chime",
      icon_url: "https://grove.convex.site/chime/icon-512.png",
    });
  });

  test("the first Grove when several are trusted", () => {
    vi.stubEnv("GROVE_SITE_URL", "https://a.convex.site, https://b.convex.site");
    expect(slackSender(chime).icon_url).toBe("https://a.convex.site/chime/icon-512.png");
  });

  test("an explicit icon wins", () => {
    expect(slackSender({ ...chime, iconUrl: "https://x.test/i.png" }).icon_url).toBe(
      "https://x.test/i.png",
    );
  });

  test("no icon Slack couldn't fetch: a local Grove, or none set", () => {
    vi.stubEnv("GROVE_SITE_URL", "http://127.0.0.1:3211");
    expect(slackSender(chime)).toEqual({ username: "Chime" });
    vi.stubEnv("GROVE_SITE_URL", "http://localhost:5173");
    expect(slackSender(chime)).toEqual({ username: "Chime" });
    vi.stubEnv("GROVE_SITE_URL", "");
    expect(slackSender(chime)).toEqual({ username: "Chime" });
  });
});

describe("groveSlack", () => {
  test("post sends the message as the app and returns where it went", async () => {
    const calls = fakeSlack();
    const item = await groveSlack(chime).post("C1", { text: "hi", unfurl_links: false });
    expect(item).toEqual({ channel: "C1", ts: "100.0" });
    expect(calls).toEqual([
      {
        method: "chat.postMessage",
        body: {
          text: "hi",
          unfurl_links: false,
          username: "Chime",
          icon_url: "https://grove.convex.site/chime/icon-512.png",
          channel: "C1",
        },
      },
    ]);
  });

  test("a channel name comes back as Slack's id", async () => {
    fakeSlack({ "chat.postMessage": () => ({ ok: true, channel: "C9", ts: "1.0" }) });
    expect(await groveSlack(chime).post("#general", { text: "hi" })).toEqual({
      channel: "C9",
      ts: "1.0",
    });
  });

  test("update edits in place, with no sender (chat.update takes none)", async () => {
    const calls = fakeSlack();
    const item = await groveSlack(chime).update({ channel: "C1", ts: "5.0" }, { text: "v2" });
    expect(item).toEqual({ channel: "C1", ts: "5.0" });
    expect(calls).toEqual([
      { method: "chat.update", body: { text: "v2", channel: "C1", ts: "5.0" } },
    ]);
  });

  test("upsert posts the first time and updates after", async () => {
    const calls = fakeSlack();
    const slack = groveSlack(chime);
    const first = await slack.upsert(undefined, "C1", { text: "v1" });
    const second = await slack.upsert(first, "C1", { text: "v2" });
    expect(second).toEqual(first);
    expect(calls.map((c) => c.method)).toEqual(["chat.postMessage", "chat.update"]);
  });

  test("upsert posts afresh when the old message is gone", async () => {
    const calls = fakeSlack({
      "chat.update": () => ({ ok: false, error: "message_not_found" }),
    });
    const item = await groveSlack(chime).upsert({ channel: "C1", ts: "5.0" }, "C1", {
      text: "v2",
    });
    expect(item).toEqual({ channel: "C1", ts: "100.0" });
    expect(calls.map((c) => c.method)).toEqual(["chat.update", "chat.postMessage"]);
  });

  test("upsert passes on any other failure", async () => {
    fakeSlack({ "chat.update": () => ({ ok: false, error: "ratelimited" }) });
    await expect(
      groveSlack(chime).upsert({ channel: "C1", ts: "5.0" }, "C1", { text: "v2" }),
    ).rejects.toThrow("Slack chat.update failed: ratelimited");
  });

  test("reply goes in the item's thread, broadcast only when asked", async () => {
    const calls = fakeSlack();
    const slack = groveSlack(chime);
    const item = { channel: "C1", ts: "5.0" };
    await slack.reply(item, { text: "approved" });
    await slack.reply(item, { text: "cancelled" }, { broadcast: true });
    expect(calls[0].body).toMatchObject({ channel: "C1", thread_ts: "5.0", username: "Chime" });
    expect(calls[0].body.reply_broadcast).toBeUndefined();
    expect(calls[1].body).toMatchObject({ thread_ts: "5.0", reply_broadcast: true });
  });

  test("digest is one post of bullets, and nothing when empty", async () => {
    const calls = fakeSlack();
    const slack = groveSlack(chime);
    expect(await slack.digest("C1", { title: "Today", lines: [] })).toBeNull();
    expect(calls).toEqual([]);
    await slack.digest("C1", { title: "Today", lines: ["one", "two"], unfurl_links: false });
    expect(calls[0].body).toMatchObject({
      channel: "C1",
      text: "*Today*\n• one\n• two",
      unfurl_links: false,
      username: "Chime",
    });
  });

  test("dm opens the conversation and posts as the app", async () => {
    const calls = fakeSlack();
    const item = await groveSlack(chime).dm("U1", { text: "your turn" });
    expect(item).toEqual({ channel: "D1", ts: "101.0" });
    expect(calls[0]).toEqual({ method: "conversations.open", body: { users: "U1" } });
    expect(calls[1].body).toMatchObject({ channel: "D1", text: "your turn", username: "Chime" });
  });
});

test("sendSlackDm still posts as the shared bot", async () => {
  const calls = fakeSlack();
  await sendSlackDm("U1", "hi");
  expect(calls[1]).toEqual({
    method: "chat.postMessage",
    body: { text: "hi", unfurl_links: false, channel: "D1" },
  });
});

test("slackApi throws SlackApiError with the code, in the old message", async () => {
  fakeSlack({ "chat.postMessage": () => ({ ok: false, error: "not_in_channel" }) });
  const error = await slackApi("chat.postMessage", { channel: "C1", text: "x" }).catch(
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(SlackApiError);
  expect(error).toMatchObject({ code: "not_in_channel", method: "chat.postMessage" });
  expect((error as Error).message).toBe("Slack chat.postMessage failed: not_in_channel");
});

test("slackMention", () => {
  expect(slackMention("U123")).toBe("<@U123>");
});
