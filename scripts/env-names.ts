#!/usr/bin/env bun
// Lists the deployment's environment variable NAMES with a fingerprint of
// each value, never the value itself. Pass --prod for production.
//
//   bun run env:names
//   bun run env:names --prod
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const proc = Bun.spawn(["bunx", "convex", "env", "list", ...args], {
  stdout: "pipe",
  stderr: "pipe",
});
const out = await new Response(proc.stdout).text();
const err = await new Response(proc.stderr).text();
if ((await proc.exited) !== 0) {
  // The CLI's error text never contains values.
  console.error(err.trim());
  process.exit(1);
}

// Values may span lines (multi-line JSON keys); a new variable starts only
// at a line that looks like NAME=.
const entries: { name: string; value: string }[] = [];
for (const line of out.split("\n")) {
  const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
  if (match) {
    entries.push({ name: match[1], value: match[2] });
  } else if (entries.length > 0) {
    entries[entries.length - 1].value += `\n${line}`;
  }
}
for (const { name, value } of entries) {
  const fingerprint = createHash("sha256").update(value).digest("hex").slice(0, 8);
  console.log(`${name.padEnd(32)} sha256:${fingerprint}  ${value.length} chars`);
}
