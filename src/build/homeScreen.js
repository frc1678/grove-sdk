import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

// The icon a phone puts on its home screen when someone adds a Grove app.
//
// An app has one icon, public/favicon.svg, and the browser tab, the header
// and the Grove's dashboard card all read that file. iOS will not use an
// SVG for a home-screen icon: with no PNG `apple-touch-icon` it draws a grey
// tile with the page title's first letter, which is what every app showed
// until this plugin. Committing PNG copies would make a second icon that
// goes stale the first time someone redraws the SVG, so the PNGs are drawn
// from favicon.svg on every build instead:
//
//   apple-touch-icon.png  180px  iOS / iPadOS
//   icon-192.png          192px  Android, via the manifest
//   icon-512.png          512px  Android's splash screen, via the manifest
//   manifest.webmanifest         the name and icons Android uses
//
// Each is the favicon centred on the app shell's dark background, at
// ICON_SCALE of the tile. iOS fills a transparent icon with black and
// rounds the corners itself, so the tile is square and opaque.
//
// Used from vite.config.ts:
//
//   import { groveHomeScreen } from "@frc1678/grove-sdk/build"
//
//   export default defineConfig({
//     plugins: [react(), tailwindcss(), groveHomeScreen()],
//   })
//
// The name under the icon defaults to package.json's grove.name; the Grove,
// which has no slug, passes { name } itself. The links are written into
// index.html under Vite's `base`, so they land on /<slug>/… behind the
// Grove's proxy exactly as /favicon.svg does.
//
// Plain JavaScript on purpose: Node loads this file directly from
// node_modules, and refuses to strip types from anything under there.

export const BACKGROUND = "#0a0a0a";
export const ICON_SCALE = 0.625;
export const FAVICON = "public/favicon.svg";

export const ICONS = [
  { fileName: "apple-touch-icon.png", size: 180 },
  { fileName: "icon-192.png", size: 192 },
  { fileName: "icon-512.png", size: 512 },
];
export const MANIFEST = "manifest.webmanifest";

const SVG_OPEN = /<svg\b[^>]*>/i;

function attr(tag, name) {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match ? (match[2] ?? match[3]) : undefined;
}

function withoutAttr(tag, name) {
  return tag.replace(new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*')`, "gi"), "");
}

/**
 * The favicon as one square, opaque tile `size` pixels across: a background
 * rect, and the favicon's own <svg> nested in the middle at ICON_SCALE. The
 * nested element keeps the favicon's attributes (fill, stroke, stroke-width…),
 * so an outline icon inherits them exactly as it does in the browser tab.
 */
export function composeTileSvg(faviconSvg, { size, background = BACKGROUND, scale = ICON_SCALE }) {
  const source = faviconSvg.replace(/<\?xml[^>]*\?>/i, "").replace(/<!DOCTYPE[^>]*>/i, "");
  const open = SVG_OPEN.exec(source);
  if (open === null) throw new Error("[grove] favicon.svg has no <svg> element");
  let tag = open[0];
  if (attr(tag, "viewBox") === undefined) {
    const width = Number.parseFloat(attr(tag, "width") ?? "");
    const height = Number.parseFloat(attr(tag, "height") ?? "");
    if (!(width > 0 && height > 0)) {
      throw new Error("[grove] favicon.svg needs a viewBox, or a width and height");
    }
    tag = tag.replace(/^<svg/i, `<svg viewBox="0 0 ${width} ${height}"`);
  }
  const inner = size * scale;
  const offset = (size - inner) / 2;
  for (const name of ["x", "y", "width", "height"]) tag = withoutAttr(tag, name);
  tag = tag.replace(/^<svg/i, `<svg x="${offset}" y="${offset}" width="${inner}" height="${inner}"`);
  const nested = source.slice(open.index).replace(SVG_OPEN, tag);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="${background}"/>${nested}</svg>`
  );
}

let wasmReady;
function ensureWasm() {
  wasmReady ??= initWasm(
    readFileSync(createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm")),
  );
  return wasmReady;
}

/** Each home-screen PNG, drawn from the favicon's source. */
export async function renderHomeScreenIcons(faviconSvg, { background = BACKGROUND } = {}) {
  await ensureWasm();
  return ICONS.map(({ fileName, size }) => {
    const svg = composeTileSvg(faviconSvg, { size, background });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
    return { fileName, size, png };
  });
}

/** The manifest's text. Icon paths are relative, so they resolve under /<slug>/. */
export function homeScreenManifest({ name, background = BACKGROUND }) {
  return `${JSON.stringify(
    {
      name,
      short_name: name,
      start_url: "./",
      background_color: background,
      theme_color: background,
      icons: ICONS.filter(({ fileName }) => fileName !== "apple-touch-icon.png").map(
        ({ fileName, size }) => ({ src: fileName, sizes: `${size}x${size}`, type: "image/png" }),
      ),
    },
    null,
    2,
  )}\n`;
}

/** The <head> tags, with every path under Vite's base. */
export function homeScreenTags({ name, base }) {
  return [
    { tag: "link", attrs: { rel: "apple-touch-icon", href: `${base}apple-touch-icon.png` }, injectTo: "head" },
    { tag: "link", attrs: { rel: "manifest", href: `${base}${MANIFEST}` }, injectTo: "head" },
    { tag: "meta", attrs: { name: "apple-mobile-web-app-title", content: name }, injectTo: "head" },
  ];
}

function nameFromPackage(root) {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return pkg.grove?.name;
  } catch {
    return undefined;
  }
}

export function groveHomeScreen(options = {}) {
  const background = options.background ?? BACKGROUND;
  let root = process.cwd();
  let base = "/";
  let publicDir = "";
  let name;

  // Drawn once per build, and again in dev only when favicon.svg changes.
  let cache;
  async function files() {
    const source = readFileSync(join(root, options.favicon ?? FAVICON), "utf8");
    if (cache?.source !== source) {
      const icons = await renderHomeScreenIcons(source, { background });
      const entries = icons.map(({ fileName, png }) => [fileName, { type: "image/png", body: png }]);
      entries.push([
        MANIFEST,
        { type: "application/manifest+json", body: homeScreenManifest({ name, background }) },
      ]);
      cache = { source, files: new Map(entries) };
    }
    return cache.files;
  }

  return {
    name: "grove-home-screen",
    configResolved(config) {
      root = config.root;
      publicDir = config.publicDir;
      base = config.base.endsWith("/") ? config.base : `${config.base}/`;
      name = options.name ?? nameFromPackage(root);
      if (!name) {
        throw new Error(
          '[grove] groveHomeScreen() needs a name: set "grove": { "name" } in package.json, or pass { name }.',
        );
      }
    },
    // A copy in public/ would be copied over (or next to) the drawn file and
    // quietly go stale, which is the problem this plugin exists to remove.
    buildStart() {
      const copies = [...ICONS.map(({ fileName }) => fileName), MANIFEST].filter(
        (fileName) => publicDir && existsSync(join(publicDir, fileName)),
      );
      if (copies.length > 0) {
        throw new Error(
          `[grove] groveHomeScreen() draws ${copies.join(", ")} from favicon.svg; delete the copies in public/.`,
        );
      }
    },
    async generateBundle() {
      for (const [fileName, { body }] of await files()) {
        this.emitFile({ type: "asset", fileName, source: body });
      }
    },
    transformIndexHtml() {
      return homeScreenTags({ name, base });
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? "").split("?")[0];
        if (!path.startsWith(base)) return next();
        try {
          const file = (await files()).get(path.slice(base.length));
          if (file === undefined) return next();
          res.setHeader("Content-Type", file.type);
          res.end(file.body);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
