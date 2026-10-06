// The screenshot a report opens with, and the annotated PNG it sends.
//
// modern-screenshot redraws the DOM through an SVG foreignObject, and it
// copies each <canvas> by reading its pixels (toDataURL) into the clone —
// which is what puts Sim's field, a 2D canvas, into the picture. A WebGL
// canvas created without preserveDrawingBuffer reads back blank; nothing
// in the fleet draws one today.
//
// Imported on demand: the library is only needed once someone opens the
// sheet. preloadCapture() fetches it while the page is idle, so the first
// press of the button is not also a download on venue wifi.

export type Stroke = { width: number; points: [number, number][] };

export const STROKE_COLOR = "#ef4444";

// Every Grove app's sheet would otherwise download the library on its
// first open. Idle, so it never competes with the page's own first load.
export function preloadCapture(): void {
  const load = () => void import("modern-screenshot").catch(() => {});
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(load, { timeout: 10_000 });
  } else {
    setTimeout(load, 3000);
  }
}

// What the person is looking at, not the whole scrollable document: a
// full-page image of a long list, shrunk into a phone-width sheet, is too
// small to circle anything on. The render is of the document at its scroll
// origin and then cropped, so a sticky header scrolled with the page is not
// in the crop — the part of the screen the report is about is.
//
// The sheet is already open while this runs — cloning the page takes
// seconds on a phone, in proportion to the whole document, not the
// viewport — so `exclude` keeps it out of its own picture, and the crop is
// taken from where the page was when the capture began.
export async function captureViewport(
  exclude?: (element: Element) => boolean,
): Promise<HTMLCanvasElement> {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    x: window.scrollX,
    y: window.scrollY,
  };
  const { domToCanvas } = await import("modern-screenshot");
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const backgroundColor = getComputedStyle(document.body).backgroundColor;
  // The library waits up to 30s by default for an image that will not
  // load, and until it gives up the button appears to do nothing.
  const page = await domToCanvas(document.documentElement, {
    scale,
    backgroundColor,
    timeout: 5000,
    filter:
      exclude === undefined ? null : (node) => !(node instanceof Element && exclude(node)),
  });
  const width = Math.round(viewport.width * scale);
  const height = Math.round(viewport.height * scale);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const context = out.getContext("2d");
  if (context === null) throw new Error("No 2D canvas context");
  // A page shorter than the window leaves the rest of the crop empty;
  // transparent would read as black in most image viewers.
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, width, height);
  context.drawImage(
    page,
    Math.round(viewport.x * scale),
    Math.round(viewport.y * scale),
    width,
    height,
    0,
    0,
    width,
    height,
  );
  return out;
}

// The screenshot with the pen strokes burned in, as one PNG. Strokes are in
// the screenshot's own pixel coordinates, so what was drawn is what ships.
export async function flattenAnnotated(
  screenshot: HTMLCanvasElement,
  strokes: Stroke[],
): Promise<Blob> {
  const out = document.createElement("canvas");
  out.width = screenshot.width;
  out.height = screenshot.height;
  const context = out.getContext("2d");
  if (context === null) throw new Error("No 2D canvas context");
  context.drawImage(screenshot, 0, 0);
  context.strokeStyle = STROKE_COLOR;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    context.lineWidth = stroke.width;
    context.beginPath();
    const [first, ...rest] = stroke.points;
    context.moveTo(first[0], first[1]);
    // A tap with no movement still leaves a dot.
    for (const [x, y] of rest.length === 0 ? [first] : rest) context.lineTo(x, y);
    context.stroke();
  }
  return await new Promise<Blob>((resolve, reject) =>
    out.toBlob(
      (blob) => (blob === null ? reject(new Error("Could not encode the screenshot")) : resolve(blob)),
      "image/png",
    ),
  );
}
