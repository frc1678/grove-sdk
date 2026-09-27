import { groveApiHeaders, groveSiteUrl } from "./roster";

// Tell the Grove which commit just went live, so it can mark every problem
// report fixed in that commit as shipped — it holds the Slack token, so no
// app repo needs one. Run from the app's deploy workflow after a
// successful deploy, through a thin internalAction in convex/grove.ts:
//
//   export const reportDeployed = internalAction({
//     args: { sha: v.string(), version: v.optional(v.string()) },
//     handler: (_ctx, args) => notifyGroveDeployed(args),
//   })
export async function notifyGroveDeployed({
  sha,
  version,
}: {
  sha: string;
  version?: string;
}): Promise<void> {
  const response = await fetch(new URL("/api/v1/deployed", groveSiteUrl()), {
    method: "POST",
    headers: { ...groveApiHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ sha, version }),
  });
  if (!response.ok) {
    throw new Error(`Grove deployed notice failed: ${response.status} ${await response.text()}`);
  }
}
