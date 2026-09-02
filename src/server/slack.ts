// Minimal Slack Web API client shared by the Grove apps' bots. The bot token
// lives in the SLACK_BOT_TOKEN Convex env var; one workspace bot serves
// every app on the deployment.

export function slackToken(): string {
  const token = process.env.SLACK_BOT_TOKEN;
  if (token === undefined || token === "") {
    throw new Error(
      "SLACK_BOT_TOKEN is not set (bunx convex env set SLACK_BOT_TOKEN=…)",
    );
  }
  return token;
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
    throw new Error(`Slack ${method} failed: ${result.error ?? "unknown"}`);
  }
  return result;
}

// Direct-message a workspace member (by Slack user id). Opens the DM
// conversation first; Slack needs the `im:write` + `chat:write` scopes.
export async function sendSlackDm(
  slackUserId: string,
  text: string,
): Promise<void> {
  const opened = await slackApi("conversations.open", { users: slackUserId });
  const channelId = (opened.channel as { id?: string } | undefined)?.id;
  if (channelId === undefined) {
    throw new Error("Slack conversations.open returned no channel");
  }
  await slackApi("chat.postMessage", {
    channel: channelId,
    text,
    unfurl_links: false,
  });
}
