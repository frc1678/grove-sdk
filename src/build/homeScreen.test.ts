import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-wasm";
import { build } from "vite";
import { afterAll, describe, expect, test } from "vitest";
import {
  BACKGROUND,
  composeTileSvg,
  groveHomeScreen,
  homeScreenManifest,
  renderHomeScreenIcons,
} from "./homeScreen.js";

// Two real shapes from the fleet: a Lucide outline whose stroke lives on the
// root <svg> (Chime's bell), and the Grove's filled tree on a 32px viewBox.
const OUTLINE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>';
const FILLED =
  '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><title>The Grove</title><circle cx="16" cy="16" r="16" fill="#3cd52e"/></svg>';

function pngSize(png: Uint8Array): [number, number] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
}

function pixel(svg: string, size: number, x: number, y: number): string {
  const { pixels } = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render();
  const i = (y * size + x) * 4;
  return `#${[pixels[i], pixels[i + 1], pixels[i + 2]].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

describe("composeTileSvg", () => {
  test("centres the favicon at 62.5% on an opaque tile, keeping its stroke", async () => {
    await renderHomeScreenIcons(OUTLINE); // initialises the wasm
    const svg = composeTileSvg(OUTLINE, { size: 180 });
    expect(svg).toContain('<svg x="33.75" y="33.75" width="112.5" height="112.5"');
    expect(svg).toContain('stroke="#f97316"');
    expect(svg).not.toContain('width="48"');
    expect(pixel(svg, 180, 0, 0)).toBe(BACKGROUND);
    expect(pixel(svg, 180, 179, 179)).toBe(BACKGROUND);
  });

  test("draws a filled icon edge to edge of its inner box, and drops the XML prolog", async () => {
    await renderHomeScreenIcons(FILLED);
    const svg = composeTileSvg(FILLED, { size: 512 });
    expect(svg).not.toContain("<?xml");
    expect(pixel(svg, 512, 256, 256)).toBe("#3cd52e");
    expect(pixel(svg, 512, 10, 256)).toBe(BACKGROUND);
  });

  test("makes a viewBox from width and height when there is none", () => {
    const svg = composeTileSvg('<svg width="24" height="24"><rect width="24" height="24"/></svg>', {
      size: 192,
    });
    expect(svg).toContain('viewBox="0 0 24 24"');
  });

  test("refuses a favicon it cannot scale", () => {
    expect(() => composeTileSvg("<svg><rect/></svg>", { size: 180 })).toThrow(/viewBox/);
    expect(() => composeTileSvg("not an svg", { size: 180 })).toThrow(/no <svg>/);
  });
});

test("renders each icon at its own size", async () => {
  const icons = await renderHomeScreenIcons(OUTLINE);
  expect(icons.map(({ fileName, png }) => [fileName, pngSize(png)])).toEqual([
    ["apple-touch-icon.png", [180, 180]],
    ["icon-192.png", [192, 192]],
    ["icon-512.png", [512, 512]],
  ]);
});

test("the manifest's icons are relative, so they resolve under /<slug>/", () => {
  const manifest = JSON.parse(homeScreenManifest({ name: "Chime" }));
  expect(manifest).toMatchObject({ name: "Chime", short_name: "Chime", start_url: "./" });
  expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual(["icon-192.png", "icon-512.png"]);
});

describe("groveHomeScreen in a Vite build", () => {
  const root = mkdtempSync(join(tmpdir(), "grove-home-screen-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  test("emits the PNGs and manifest and links them under base", async () => {
    mkdirSync(join(root, "public"));
    writeFileSync(join(root, "public", "favicon.svg"), OUTLINE);
    writeFileSync(join(root, "package.json"), JSON.stringify({ grove: { slug: "chime", name: "Chime" } }));
    writeFileSync(
      join(root, "index.html"),
      '<!doctype html><html><head><link rel="icon" href="/favicon.svg" /><title>Chime</title></head><body></body></html>',
    );
    const outDir = join(root, "dist");
    await build({
      root,
      base: "/chime/",
      logLevel: "silent",
      configFile: false,
      plugins: [groveHomeScreen()],
      build: { outDir },
    });

    for (const file of ["apple-touch-icon.png", "icon-192.png", "icon-512.png", "manifest.webmanifest"]) {
      expect(existsSync(join(outDir, file)), file).toBe(true);
    }
    expect(pngSize(readFileSync(join(outDir, "apple-touch-icon.png")))).toEqual([180, 180]);
    const html = readFileSync(join(outDir, "index.html"), "utf8");
    expect(html).toContain('<link rel="apple-touch-icon" href="/chime/apple-touch-icon.png">');
    expect(html).toContain('<link rel="manifest" href="/chime/manifest.webmanifest">');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Chime">');
    expect(JSON.parse(readFileSync(join(outDir, "manifest.webmanifest"), "utf8")).name).toBe("Chime");
  });

  test("refuses a hand-made copy in public/, which would go stale", async () => {
    writeFileSync(join(root, "public", "apple-touch-icon.png"), "old");
    await expect(
      build({ root, logLevel: "silent", configFile: false, plugins: [groveHomeScreen()] }),
    ).rejects.toThrow(/apple-touch-icon\.png.*delete the copies in public/);
    rmSync(join(root, "public", "apple-touch-icon.png"));
  });

  test("an app with no name is told where to put one", async () => {
    const bare = mkdtempSync(join(tmpdir(), "grove-home-screen-"));
    writeFileSync(join(bare, "package.json"), "{}");
    writeFileSync(join(bare, "index.html"), "<!doctype html><html><head></head><body></body></html>");
    await expect(
      build({ root: bare, logLevel: "silent", configFile: false, plugins: [groveHomeScreen()] }),
    ).rejects.toThrow(/grove.*name/);
    rmSync(bare, { recursive: true, force: true });
  });
});
