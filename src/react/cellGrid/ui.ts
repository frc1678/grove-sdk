import { parseTSV } from "./clipboard";

// The layer a cell grid draws on: the selection's outline, the fill handle,
// the phone's two dots and action bar, the toast with Undo, and the box a
// paste goes into when the browser won't let the page read the clipboard.
//
// Plain DOM in a fixed layer on <body>, not React inside the table: it
// moves on every pointer move of a drag, and drawing it here costs the
// table no re-render. Colours come from the app's theme tokens.

export type GridActions = {
  startFill: () => void;
  fillToEnd: () => void;
  startHandle: (which: "start" | "end") => void;
  copyToClipboard: () => Promise<void>;
  pasteFromClipboard: () => Promise<void>;
  paste: (matrix: string[][]) => unknown;
  fillFrom: (dir: "down" | "right") => void;
  clearRange: () => unknown;
  edit: () => void;
  undo: (redo?: boolean) => Promise<void>;
};

export type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
export const box = (left: number, top: number, right: number, bottom: number): Box => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
});

export type DrawState = {
  range: Box | null;
  multi: boolean;
  active: Box | null;
  ants: Box | null;
  preview: Box | null;
  clip: Box;
  touch: boolean;
  count: number;
  editing: boolean;
};

const CSS = `
:root { --grove-grid: oklch(0.55 0.19 257); }
.dark { --grove-grid: oklch(0.7 0.15 257); }
[data-grid-col] { -webkit-user-select: none; user-select: none; }
[data-grid-col] :is(input, textarea, [contenteditable="true"]) { -webkit-user-select: text; user-select: text; }
@media (pointer: fine) { [data-grid-col] { cursor: cell; } }
[data-grid-selected] { background-color: color-mix(in oklch, var(--grove-grid) 10%, transparent) !important; }
.grove-grid-layer { position: fixed; inset: 0; pointer-events: none; z-index: 15; }
.grove-grid-box { position: absolute; box-sizing: border-box; pointer-events: none; display: none; }
.grove-grid-range { border: 1px solid var(--grove-grid); }
.grove-grid-active { border: 2px solid var(--grove-grid); border-radius: 2px; }
.grove-grid-preview { border: 1.5px dashed var(--grove-grid); }
.grove-grid-ants { border: 2px dashed var(--grove-grid); animation: grove-grid-ants 0.7s linear infinite; }
@keyframes grove-grid-ants { 50% { border-color: color-mix(in oklch, var(--grove-grid) 35%, transparent); } }
.grove-grid-handle { position: absolute; width: 8px; height: 8px; margin: -4px 0 0 -4px; background: var(--grove-grid); outline: 1.5px solid var(--background); pointer-events: auto; cursor: crosshair; display: none; touch-action: none; }
.grove-grid-handle::after { content: ""; position: absolute; inset: -6px; }
.grove-grid-dot { position: absolute; width: 36px; height: 36px; margin: -18px 0 0 -18px; pointer-events: auto; display: none; touch-action: none; }
.grove-grid-dot::after { content: ""; position: absolute; inset: 10px; border-radius: 50%; background: var(--grove-grid); border: 3px solid var(--background); box-shadow: 0 2px 6px oklch(0 0 0 / 0.3); }
.grove-grid-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 45; pointer-events: auto; display: none; background: color-mix(in oklch, var(--popover, white) 92%, transparent); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); border-top: 1px solid var(--border); padding: 6px max(8px, env(safe-area-inset-right, 0px)) calc(6px + env(safe-area-inset-bottom, 0px)) max(8px, env(safe-area-inset-left, 0px)); color: var(--foreground); }
.grove-grid-bar > div { max-width: 40rem; margin: 0 auto; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 2px; }
.grove-grid-bar button { font: inherit; font-size: 0.7rem; display: grid; justify-items: center; gap: 2px; padding: 6px 0; border: 0; border-radius: 8px; background: transparent; color: inherit; }
.grove-grid-bar button:active { background: var(--accent); }
.grove-grid-bar svg { width: 20px; height: 20px; }
.grove-grid-toast { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(16px + env(safe-area-inset-bottom, 0px)); z-index: 60; pointer-events: auto; display: none; align-items: center; gap: 12px; max-width: min(28rem, calc(100vw - 32px)); padding: 8px 12px; border-radius: 10px; font-size: 0.82rem; background: var(--foreground); color: var(--background); box-shadow: 0 10px 30px -12px oklch(0 0 0 / 0.5); }
.grove-grid-toast[data-error] { background: var(--destructive); color: white; }
.grove-grid-toast[data-raised] { bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
.grove-grid-toast button { font: inherit; font-weight: 600; border: 0; padding: 0; background: transparent; color: inherit; text-decoration: underline; cursor: pointer; }
.grove-grid-sheet { border: 1px solid var(--border); border-radius: 14px; padding: 16px; width: min(28rem, calc(100vw - 32px)); background: var(--popover, white); color: var(--foreground); }
.grove-grid-sheet::backdrop { background: oklch(0 0 0 / 0.35); }
.grove-grid-sheet form { display: grid; gap: 10px; }
.grove-grid-sheet textarea { font: inherit; font-size: 0.85rem; min-height: 7rem; padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--background); color: inherit; }
.grove-grid-sheet p { margin: 0; font-size: 0.82rem; color: var(--muted-foreground); }
.grove-grid-sheet div { display: flex; justify-content: flex-end; gap: 8px; }
.grove-grid-sheet button { font: inherit; font-size: 0.85rem; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: inherit; }
.grove-grid-sheet button[value="apply"] { background: var(--primary); color: var(--primary-foreground); border-color: var(--primary); }
@media (prefers-reduced-motion: reduce) { .grove-grid-ants { animation: none; } }
`;

const ICON = (path: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const BAR: { act: string; label: string; icon: string }[] = [
  { act: "copy", label: "Copy", icon: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>' },
  { act: "paste", label: "Paste", icon: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9z"/>' },
  { act: "down", label: "Fill down", icon: '<path d="M12 4v15M6 13l6 6 6-6"/>' },
  { act: "right", label: "Fill right", icon: '<path d="M4 12h15M13 6l6 6-6 6"/>' },
  { act: "clear", label: "Clear", icon: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>' },
  { act: "edit", label: "Edit", icon: '<path d="M4 20h4L19 9l-4-4L4 16z"/>' },
];

let styled = false;
function injectStyles() {
  if (styled) return;
  styled = true;
  const style = document.createElement("style");
  style.dataset.groveGrid = "";
  style.textContent = CSS;
  document.head.append(style);
}

function div(className: string, parent: HTMLElement) {
  const el = document.createElement("div");
  el.className = className;
  parent.append(el);
  return el;
}

export class CellGridUI {
  private layer: HTMLElement;
  private boxes: Record<"range" | "active" | "ants" | "preview", HTMLElement>;
  private handle: HTMLElement;
  private dots: [HTMLElement, HTMLElement];
  private bar: HTMLElement;
  private toastEl: HTMLElement;
  private sheet: HTMLDialogElement | null = null;
  private toastTimer = 0;

  constructor(private grid: GridActions) {
    injectStyles();
    this.layer = document.createElement("div");
    this.layer.className = "grove-grid-layer";
    this.layer.dataset.gridUi = "";
    document.body.append(this.layer);
    this.boxes = {
      range: div("grove-grid-box grove-grid-range", this.layer),
      ants: div("grove-grid-box grove-grid-ants", this.layer),
      active: div("grove-grid-box grove-grid-active", this.layer),
      preview: div("grove-grid-box grove-grid-preview", this.layer),
    };

    this.handle = div("grove-grid-handle", this.layer);
    this.handle.title = "Drag to fill. Double-click to fill to the bottom.";
    this.handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      grid.startFill();
    });
    this.handle.addEventListener("dblclick", () => grid.fillToEnd());

    this.dots = [div("grove-grid-dot", this.layer), div("grove-grid-dot", this.layer)];
    this.dots.forEach((dot, i) =>
      dot.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        grid.startHandle(i === 0 ? "start" : "end");
      }),
    );

    this.bar = document.createElement("div");
    this.bar.className = "grove-grid-bar";
    this.bar.dataset.gridUi = "";
    this.bar.setAttribute("role", "toolbar");
    this.bar.setAttribute("aria-label", "Selected cells");
    this.bar.innerHTML = `<div>${BAR.map((b) => `<button type="button" data-act="${b.act}">${ICON(b.icon)}${b.label}</button>`).join("")}</div>`;
    this.bar.addEventListener("click", (e) => {
      const act = (e.target as Element).closest<HTMLElement>("[data-act]")?.dataset.act;
      if (act === "copy") void grid.copyToClipboard();
      else if (act === "paste") void grid.pasteFromClipboard();
      else if (act === "down" || act === "right") grid.fillFrom(act);
      else if (act === "clear") void grid.clearRange();
      else if (act === "edit") grid.edit();
    });
    document.body.append(this.bar);

    this.toastEl = document.createElement("div");
    this.toastEl.className = "grove-grid-toast";
    this.toastEl.dataset.gridUi = "";
    this.toastEl.setAttribute("role", "status");
    document.body.append(this.toastEl);
  }

  draw(state: DrawState) {
    const { clip } = state;
    this.place(this.boxes.range, state.multi ? state.range : null, clip);
    this.place(this.boxes.active, state.active, clip);
    this.place(this.boxes.ants, state.ants, clip, 1);
    this.place(this.boxes.preview, state.preview, clip);
    const r = state.range;
    const visible = (x: number, y: number) => x >= clip.left && x <= clip.right && y >= clip.top && y <= clip.bottom;
    const corner = r && !state.touch && visible(r.right, r.bottom);
    this.handle.style.display = corner ? "block" : "none";
    if (r && corner) Object.assign(this.handle.style, { left: `${r.right}px`, top: `${r.bottom}px` });
    const dots: [number, number][] = r ? [[r.left, r.top], [r.right, r.bottom]] : [];
    this.dots.forEach((dot, i) => {
      const at = dots[i];
      const show = state.touch && at !== undefined && visible(at[0], at[1]);
      dot.style.display = show ? "block" : "none";
      if (show) Object.assign(dot.style, { left: `${at[0]}px`, top: `${at[1]}px` });
    });
    const bar = state.touch && state.count > 0 && !state.editing;
    this.bar.style.display = bar ? "block" : "none";
    this.toastEl.toggleAttribute("data-raised", bar);
  }

  private place(el: HTMLElement, rect: Box | null, clip: Box, pad = 0) {
    if (!rect || rect.right < clip.left || rect.left > clip.right || rect.bottom < clip.top || rect.top > clip.bottom) {
      el.style.display = "none";
      return;
    }
    const left = rect.left - pad;
    const top = rect.top - pad;
    const width = rect.width + pad * 2;
    const height = rect.height + pad * 2;
    const inset = [
      Math.max(0, clip.top - top),
      Math.max(0, left + width - clip.right),
      Math.max(0, top + height - clip.bottom),
      Math.max(0, clip.left - left),
    ];
    Object.assign(el.style, {
      display: "block",
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      clipPath: inset.some((n) => n > 0) ? `inset(${inset.map((n) => `${n}px`).join(" ")})` : "",
    });
  }

  toast(message: string, { undo, error }: { undo?: boolean; error?: boolean } = {}) {
    const el = this.toastEl;
    el.replaceChildren(Object.assign(document.createElement("span"), { textContent: message }));
    if (undo) {
      const button = Object.assign(document.createElement("button"), { type: "button", textContent: "Undo" });
      button.addEventListener("click", () => {
        el.style.display = "none";
        void this.grid.undo();
      });
      el.append(button);
    }
    el.toggleAttribute("data-error", error === true);
    el.style.display = "flex";
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (el.style.display = "none"), error ? 7000 : 5000);
  }

  // A phone browser that won't hand the page the clipboard still lets a
  // person paste into a text box: so ask for it there.
  askForPaste() {
    if (!this.sheet) {
      const sheet = document.createElement("dialog");
      sheet.className = "grove-grid-sheet";
      sheet.dataset.gridUi = "";
      sheet.setAttribute("aria-label", "Paste cells");
      sheet.innerHTML = `<form method="dialog"><strong>Paste cells</strong><p>Press and hold in the box, choose Paste, then Apply.</p><textarea aria-label="Cells to paste"></textarea><div><button value="cancel">Cancel</button><button value="apply">Apply</button></div></form>`;
      sheet.addEventListener("close", () => {
        const text = sheet.querySelector("textarea")?.value ?? "";
        if (sheet.returnValue === "apply" && text !== "") {
          void this.grid.paste(parseTSV(text));
        }
      });
      document.body.append(sheet);
      this.sheet = sheet;
    }
    const textarea = this.sheet.querySelector("textarea");
    if (textarea) textarea.value = "";
    this.sheet.returnValue = "";
    this.sheet.showModal();
  }

  destroy() {
    window.clearTimeout(this.toastTimer);
    this.layer.remove();
    this.bar.remove();
    this.toastEl.remove();
    this.sheet?.remove();
  }
}
