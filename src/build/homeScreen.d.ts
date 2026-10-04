import type { HtmlTagDescriptor, Plugin } from "vite";

export type HomeScreenOptions = {
  /** The name under the icon. Defaults to package.json's grove.name. */
  name?: string;
  /** The tile behind the favicon. Defaults to the app shell's dark background. */
  background?: string;
  /** Path, relative to the Vite root, of the app's one icon. */
  favicon?: string;
};

export type HomeScreenIcon = { fileName: string; size: number; png: Uint8Array };

export declare const BACKGROUND: string;
export declare const ICON_SCALE: number;
export declare const FAVICON: string;
export declare const ICONS: ReadonlyArray<{ fileName: string; size: number }>;
export declare const MANIFEST: string;

export declare function composeTileSvg(
  faviconSvg: string,
  options: { size: number; background?: string; scale?: number },
): string;
export declare function renderHomeScreenIcons(
  faviconSvg: string,
  options?: { background?: string },
): Promise<HomeScreenIcon[]>;
export declare function homeScreenManifest(options: { name: string; background?: string }): string;
export declare function homeScreenTags(options: { name: string; base: string }): HtmlTagDescriptor[];
/** Draws the home-screen PNGs and manifest from public/favicon.svg on every build. */
export declare function groveHomeScreen(options?: HomeScreenOptions): Plugin;
