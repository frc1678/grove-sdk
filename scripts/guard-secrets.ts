#!/usr/bin/env bun
// Claude Code PreToolUse hook: refuses shell commands that would print
// deployment secrets into a transcript. Registered in .claude/settings.json.
//
// Reads the tool call as JSON on stdin; exit code 2 blocks the call and
// returns the message on stderr to the agent.
export {};
const raw = await Bun.stdin.text();
let command = "";
try {
  command = (JSON.parse(raw).tool_input?.command ?? "") as string;
} catch {
  process.exit(0);
}

// Each pattern is checked per line, so a heredoc body that merely mentions
// a file name doesn't trip it.
const patterns: [RegExp, string][] = [
  [
    /\bconvex\s+env\s+(list|get)\b/,
    "prints secret values. Use `bun run env:names` (names + fingerprints only).",
  ],
  [
    /\b(cat|less|more|head|tail|bat|sed|awk|grep|rg|ugrep|strings|xxd|od|base64)\b[^|;&]*\s\.?\/?[\w./-]*\.env(\.[\w.-]+)?(\s|$|['")])/,
    "dumps a .env file. Use `bun run env:names` or read a single non-secret key by name.",
  ],
  [/(^|[;&|]\s*)(printenv|env)\s*($|\||>)/, "dumps the process environment."],
  [
    /\bconvex\s+run\b[^|;&]*process\.env/,
    "evaluates process.env on the deployment.",
  ],
  [/\bconvex\s+env\s+set\b[^|;&]*(JWT_PRIVATE_KEY|GOOGLE_SERVICE_ACCOUNT_JSON)=/,
    "would paste a private key into the transcript. Set it from a file: `bunx convex env set NAME=\"$(cat file)\"` typed by a person, not the agent."],
];

for (const line of command.split("\n")) {
  for (const [pattern, why] of patterns) {
    if (pattern.test(line)) {
      console.error(`Blocked: this command ${why}`);
      process.exit(2);
    }
  }
}
