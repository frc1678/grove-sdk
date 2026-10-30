// Minimal Slack Web API client shared by the Grove apps' bots. The bot token
// lives in the SLACK_BOT_TOKEN Convex env var; one workspace bot serves
// every app on the deployment, and groveSlack() makes each app's posts come
// from that app rather than from the shared bot.

import { optionalEnv } from "./env";

export function slackToken(): string {
  const token = process.env.SLACK_BOT_TOKEN;
  if (token === undefined || token === "") {
    throw new Error(
      "SLACK_BOT_TOKEN is not set (bunx convex env set SLACK_BOT_TOKEN=…)",
    );
  }
  return token;
}

// What slackApi throws when Slack answers `ok: false`. The message is the
// same "Slack <method> failed: <code>" it always was; `code` saves parsing it.
export class SlackApiError extends Error {
  readonly method: string;
  readonly code: string;
  constructor(method: string, code: string) {
    super(`Slack ${method} failed: ${code}`);
    this.name = "SlackApiError";
    this.method = method;
    this.code = code;
  }
}

export async function slackApi(
  method: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${slackToken()}`,
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as {
    ok: boolean;
    error?: string;
  } & Record<string, unknown>;
  if (!result.ok) {
    throw new SlackApiError(method, result.error ?? "unknown");
  }
  return result;
}

// Direct-message a workspace member (by Slack user id). Opens the DM
// conversation first; Slack needs the `im:write` + `chat:write` scopes.
// Posts as the shared bot; groveSlack(app).dm posts as the app.
export async function sendSlackDm(
  slackUserId: string,
  text: string,
): Promise<void> {
  await slackDm(slackUserId, { text, unfurl_links: false });
}

async function slackDm(
  slackUserId: string,
  message: Record<string, unknown>,
): Promise<SlackItem> {
  const opened = await slackApi("conversations.open", { users: slackUserId });
  const channelId = (opened.channel as { id?: string } | undefined)?.id;
  if (channelId === undefined) {
    throw new Error("Slack conversations.open returned no channel");
  }
  const posted = await slackApi("chat.postMessage", {
    ...message,
    channel: channelId,
  });
  return { channel: channelId, ts: String(posted.ts) };
}

// ---------------------------------------------------------------------------
// Posting as the app, by the Grove's posting rule (README, "Slack"):
//
// 1. One message per item (a request, an event, a task), posted once and
//    then edited in place when the item changes. The app stores the
//    SlackItem (channel + ts) on the item's row.
// 2. Later news about the item goes as a reply in that message's thread.
// 3. Anything that isn't urgent waits for a digest; a day with nothing in
//    it posts nothing.
// 4. Mention someone (`<@U…>`) only when they have to act.
// 5. Every post comes from the app: its name, and a PNG of its icon.

// Who the posts come from. `name` is the app's display name (package.json's
// `grove.name`); `slug` is where it is served, which is where the icon is.
export type GroveSlackApp = {
  name: string;
  slug: string;
  // Defaults to the icon-512.png that groveHomeScreen() draws from
  // favicon.svg, served under the Grove's origin. Slack ignores an SVG.
  iconUrl?: string;
};

// A message as chat.postMessage takes it, minus the channel.
export type SlackMessage = { text: string; blocks?: unknown[] } & Record<
  string,
  unknown
>;

// The address of a posted message: keep it to update the message later or
// to reply in its thread.
export type SlackItem = { channel: string; ts: string };

// `username` and `icon_url` for a chat.postMessage (or chat.postEphemeral)
// body, for an app that builds its own calls. Slack applies them only when
// the bot has the `chat:write.customize` scope, and otherwise posts as the
// bot. chat.update takes neither: an edit keeps the original author.
export function slackSender(app: GroveSlackApp): {
  username: string;
  icon_url?: string;
} {
  const iconUrl = app.iconUrl ?? defaultIconUrl(app.slug);
  return iconUrl === undefined
    ? { username: app.name }
    : { username: app.name, icon_url: iconUrl };
}

function defaultIconUrl(slug: string): string | undefined {
  const site = optionalEnv("GROVE_SITE_URL")?.split(",")[0].trim().replace(/\/$/, "");
  if (site === undefined || site === "") return undefined;
  // Slack fetches the icon itself, so a local Grove's URL would never load.
  const host = new URL(site).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) {
    return undefined;
  }
  return `${site}/${slug}/icon-512.png`;
}

// `<@U…>`: notifies the person. Only for someone who has to act; name
// anyone else in plain text.
export function slackMention(slackUserId: string): string {
  return `<@${slackUserId}>`;
}

export type GroveSlack = {
  // A new item's message, posted as the app.
  post(channel: string, message: SlackMessage): Promise<SlackItem>;
  // Edit an item's message in place. Its author stays whoever posted it.
  update(item: SlackItem, message: SlackMessage): Promise<SlackItem>;
  // Update the item's message if it has one, otherwise post it. If the old
  // message is gone (deleted, or its channel archived), posts a new one; the
  // caller stores whatever comes back.
  upsert(
    item: SlackItem | null | undefined,
    channel: string,
    message: SlackMessage,
  ): Promise<SlackItem>;
  // Later news about an item, in its thread. `broadcast` also shows the
  // reply in the channel; keep it for news the whole channel needs.
  reply(
    item: SlackItem,
    message: SlackMessage,
    options?: { broadcast?: boolean },
  ): Promise<SlackItem>;
  // One post for everything that could wait: a title and a line each.
  // Posts nothing and returns null when there are no lines.
  digest(
    channel: string,
    digest: { title: string; lines: string[] } & Omit<SlackMessage, "text">,
  ): Promise<SlackItem | null>;
  // A direct message, as the app.
  dm(slackUserId: string, message: SlackMessage): Promise<SlackItem>;
  // username + icon_url, for a call this helper doesn't make.
  sender(): { username: string; icon_url?: string };
};

// Every Slack post a Grove app makes goes through this, so it comes from
// the app and follows the rule above:
//
//   const slack = groveSlack({ name: "Chime", slug: "chime" });
//   const item = await slack.upsert(event.slack, channel, { text, blocks });
//   await ctx.runMutation(internal.events.setSlack, { id, slack: item });
export function groveSlack(app: GroveSlackApp): GroveSlack {
  const as = () => slackSender(app);
  const post = async (channel: string, message: SlackMessage) => {
    const posted = await slackApi("chat.postMessage", {
      ...message,
      ...as(),
      channel,
    });
    return { channel: String(posted.channel ?? channel), ts: String(posted.ts) };
  };
  const update = async (item: SlackItem, message: SlackMessage) => {
    const updated = await slackApi("chat.update", {
      ...message,
      channel: item.channel,
      ts: item.ts,
    });
    return {
      channel: String(updated.channel ?? item.channel),
      ts: String(updated.ts ?? item.ts),
    };
  };
  return {
    post,
    update,
    async upsert(item, channel, message) {
      if (item === null || item === undefined) return post(channel, message);
      try {
        return await update(item, message);
      } catch (error) {
        if (error instanceof SlackApiError && GONE.has(error.code)) {
          return post(channel, message);
        }
        throw error;
      }
    },
    async reply(item, message, options = {}) {
      const posted = await slackApi("chat.postMessage", {
        ...message,
        ...as(),
        channel: item.channel,
        thread_ts: item.ts,
        ...(options.broadcast === true ? { reply_broadcast: true } : {}),
      });
      return { channel: item.channel, ts: String(posted.ts) };
    },
    async digest(channel, { title, lines, ...rest }) {
      if (lines.length === 0) return null;
      const text = [`*${title}*`, ...lines.map((line) => `• ${line}`)].join("\n");
      return post(channel, { ...rest, text });
    },
    dm: (slackUserId, message) => slackDm(slackUserId, { ...message, ...as() }),
    sender: as,
  };
}

// chat.update errors that mean the message can't be edited any more, so a
// fresh post is the item's message from now on.
const GONE = new Set([
  "message_not_found",
  "channel_not_found",
  "is_archived",
  "cant_update_message",
]);
