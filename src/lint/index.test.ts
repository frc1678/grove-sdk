// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

// Runs the real linter over a snippet, so the test covers the rule as
// `bun run lint` applies it, including oxlint loading the plugin at all.
function flaggedLines(body: string, rule = "labelled-control"): number[] {
  const dir = mkdtempSync(join(tmpdir(), "grove-lint-"));
  const file = join(dir, "sample.tsx");
  const config = join(dir, "config.json");
  writeFileSync(file, `export const Sample = (p: any) => (<div>\n${body}\n</div>)\n`);
  writeFileSync(
    config,
    JSON.stringify({
      jsPlugins: [resolve("src/lint/index.js")],
      categories: { correctness: "off" },
      rules: { [`grove/${rule}`]: "error" },
    }),
  );
  const run = spawnSync(resolve("node_modules/.bin/oxlint"), ["-c", config, "-f", "unix", file], {
    encoding: "utf8",
  });
  const out = `${run.stdout}${run.stderr}`;
  const lines = [...out.matchAll(new RegExp(`sample\\.tsx:(\\d+):\\d+: .*${rule}`, "g"))].map((m) => Number(m[1]) - 1);
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

describe("grove/hover-only-hint", () => {
  test("flags an explanation that only a hover can show", () => {
    expect(
      flaggedLines(
        [
          `<span title="Required for your subteam">Req</span>`,
          `<Button title="Clear the plate first">Start</Button>`,
          `<td title={p.when}>{p.short}</td>`,
          `<Button aria-label="Start" title="Clear the plate first"><Play /></Button>`,
        ].join("\n"),
        "hover-only-hint",
      ),
    ).toEqual([1, 2, 3, 4]);
  });

  test("leaves a control's name, truncated text, and component props alone", () => {
    expect(
      flaggedLines(
        [
          `<Button size="icon" title="Close"><X /></Button>`,
          `<span className="truncate" title={p.full}>{p.full}</span>`,
          `<span className={cn("line-clamp-2", p.extra)} title={p.full}>{p.full}</span>`,
          `<Card title="Batteries" />`,
          `<iframe title="Match video" src={p.src} />`,
          `<span>Required</span>`,
        ].join("\n"),
        "hover-only-hint",
      ),
    ).toEqual([]);
  });
});
