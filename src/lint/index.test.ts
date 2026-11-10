// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

// Runs the real linter over a snippet, so the test covers the rule as
// `bun run lint` applies it, including oxlint loading the plugin at all.
function flaggedLines(body: string): number[] {
  const dir = mkdtempSync(join(tmpdir(), "grove-lint-"));
  const file = join(dir, "sample.tsx");
  const config = join(dir, "config.json");
  writeFileSync(file, `export const Sample = (p: any) => (<div>\n${body}\n</div>)\n`);
  writeFileSync(
    config,
    JSON.stringify({
      jsPlugins: [resolve("src/lint/index.js")],
      categories: { correctness: "off" },
      rules: { "grove/labelled-control": "error" },
    }),
  );
  const run = spawnSync(resolve("node_modules/.bin/oxlint"), ["-c", config, "-f", "unix", file], {
    encoding: "utf8",
  });
  const out = `${run.stdout}${run.stderr}`;
  const lines = [...out.matchAll(/sample\.tsx:(\d+):\d+: .*labelled-control/g)].map((m) => Number(m[1]) - 1);
  if (lines.length === 0 && run.status !== 0) throw new Error(out);
  return lines;
}

describe("grove/labelled-control", () => {
  test("flags a control whose only content is an icon", () => {
    expect(
      flaggedLines(
        [
          `<Button size="icon"><X /></Button>`,
          `<button><svg /></button>`,
          `<a href="/x"><img src="a.png" alt="" /></a>`,
          `<DropdownMenuTrigger render={<Button size="icon" />}><Menu /></DropdownMenuTrigger>`,
          `<Button>{p.busy && <Spinner />}</Button>`,
          `<SelectTrigger><SelectValue /></SelectTrigger>`,
        ].join("\n"),
      ),
    ).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("accepts a label, hidden text, visible text, or props it cannot see", () => {
    expect(
      flaggedLines(
        [
          `<Button size="icon" aria-label="Close"><X /></Button>`,
          `<Button size="icon"><X /><span className="sr-only">Close</span></Button>`,
          `<Button>{p.label}</Button>`,
          `<Button {...p} />`,
          `<SaveButton />`,
          `<Menu.Close />`,
          `<Button render={<a href="/y" />}>Go</Button>`,
          `<Button render={p.hub ? <Link to="/y" /> : <a href="/y" />}>Go</Button>`,
          `<DialogTrigger render={<Button aria-label="Open menu" />}><Menu /></DialogTrigger>`,
          `<Button>{p.busy ? <Spinner /> : "Save"}</Button>`,
          `<a href="/x"><img src="a.png" alt="Citrus Circuits" /></a>`,
          `<SelectTrigger aria-label="Season"><SelectValue /></SelectTrigger>`,
        ].join("\n"),
      ),
    ).toEqual([]);
  });
});
