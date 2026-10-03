import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveGroveVersion } from "./version.js";

// Real git in a scratch repository: the whole point is what `git log -G`
// does with a history, and a mocked git would only test the mock.

let repo: string;

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repo, stdio: ["ignore", "pipe", "ignore"] });

function commit(message: string, versionFile?: string) {
  if (versionFile !== undefined) writeFileSync(join(repo, "src/version.ts"), versionFile);
  else writeFileSync(join(repo, "other.txt"), message);
  git("add", "-A");
  git("commit", "-q", "-m", message);
}

// Identity is set per repository: a CI runner has no global git identity,
// and without one every commit here fails.
function initRepo() {
  git("init", "-q");
  git("config", "user.email", "test@grove.test");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
}

const minor = () => resolveGroveVersion({ major: 3, cwd: repo }).minor;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "grove-version-"));
  mkdirSync(join(repo, "src"));
  initRepo();
  commit("start the major", "// The major.\nexport const APP_MAJOR = 3\n");
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("resolveGroveVersion", () => {
  it("counts commits since the major was set", () => {
    commit("one");
    commit("two");
    expect(minor()).toBe(2);
  });

  it("keeps counting through an edit to version.ts's comment", () => {
    // The reason this exists: a reworded comment reset four apps to .00.
    commit("one");
    commit("reword the comment", "// The major, reworded.\nexport const APP_MAJOR = 3\n");
    commit("two");
    expect(minor()).toBe(3);
  });

  it("starts again from zero when the major moves", () => {
    commit("one");
    commit("bump", "// The major.\nexport const APP_MAJOR = 4\n");
    commit("two");
    expect(resolveGroveVersion({ major: 4, cwd: repo }).label).toBe("V04.01");
  });

  it("falls back to the file's last change when the constant never matches", () => {
    // A fresh history whose version file names the constant differently.
    rmSync(join(repo, ".git"), { recursive: true, force: true });
    initRepo();
    commit("start", "export const MAJOR = 3\n");
    commit("one");
    commit("two");
    expect(minor()).toBe(2);
  });

  it("is zero outside a git repository rather than throwing", () => {
    const bare = mkdtempSync(join(tmpdir(), "grove-no-git-"));
    try {
      expect(resolveGroveVersion({ major: 3, cwd: bare }).label).toBe("V03.00");
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});
