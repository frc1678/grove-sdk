import type { ConvexReactClient } from "convex/react";
import { ConvexError } from "convex/values";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent,
  type SetStateAction,
} from "react";
import { groveApi } from "../react/api";
import type { ReportContext } from "./context";
import { flattenAnnotated, STROKE_COLOR, type Stroke } from "./screenshot";
import { captureGroveFeedback } from "./sentry";

// The sheet itself. Mounted only while a report is open, so every report
// starts clean and closing is just unmounting.
//
// Laid out for a phone first, since that is where most reports will be
// typed — at a competition, standing up: a full-width sheet from the
// bottom there, a centred dialog from sm up. Every control is at least
// 40px tall for a thumb.

const MAX_TEXT = 4000;
// Pen width in CSS pixels of the sheet, whatever the screenshot's scale.
const PEN_WIDTH = 4;
const SENT_MESSAGE_MS = 1200;

type Phase = "editing" | "sending" | "sent";

export function ReportSheet({
  client,
  app,
  screenshot,
  context,
  fullJson,
  onClose,
}: {
  client: ConvexReactClient;
  app: string;
  screenshot: HTMLCanvasElement | null;
  context: ReportContext;
  fullJson: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const textId = useId();
  const [kind, setKind] = useState<"bug" | "idea">("bug");
  const [text, setText] = useState("");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [phase, setPhase] = useState<Phase>("editing");
  const [error, setError] = useState<string | null>(null);

  // showModal() gives focus trapping, inertness behind, and Escape for
  // free. Every explicit exit calls onClose directly; the close listener is
  // for Escape, which closes the dialog natively without going through
  // React — the tutorial learned the hard way not to rely on that event
  // for exits React itself causes.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (!dialog.open) dialog.showModal();
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [onClose]);

  useEffect(() => {
    if (phase !== "sent") return;
    const timer = setTimeout(onClose, SENT_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [phase, onClose]);

  const send = async () => {
    const message = text.trim();
    if (message === "" || phase !== "editing") return;
    setPhase("sending");
    setError(null);
    try {
      let storageId: string | undefined;
      let png: Uint8Array | undefined;
      if (screenshot !== null) {
        const blob = await flattenAnnotated(screenshot, strokes);
        png = new Uint8Array(await blob.arrayBuffer());
        const uploadUrl = await client.mutation(groveApi.feedback.generateUploadUrl, {});
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": "image/png" },
          body: blob,
        });
        if (!response.ok) throw new Error(`Screenshot upload failed (${response.status})`);
        storageId = ((await response.json()) as { storageId: string }).storageId;
      }
      // Sentry is the extra, the Grove's row is the report: an ad blocker
      // that stops Sentry must not stop the report.
      const sentryEventId = await captureGroveFeedback({
        message,
        app,
        kind,
        url: context.url,
        screenshot: png,
        contextJson: fullJson,
      }).catch((sentryError: unknown) => {
        console.warn("[grove] Sentry did not take the report", sentryError);
        return undefined;
      });
      await client.mutation(groveApi.feedback.submit, {
        app,
        kind,
        text: message,
        ...(storageId === undefined ? {} : { screenshot: storageId }),
        ...(sentryEventId === undefined ? {} : { sentryEventId }),
        context,
      });
      setPhase("sent");
    } catch (sendError) {
      setError(
        sendError instanceof ConvexError
          ? String(sendError.data)
          : sendError instanceof Error
            ? sendError.message
            : String(sendError),
      );
      setPhase("editing");
    }
  };

  const canSend = text.trim() !== "" && phase === "editing";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      // The UA gives a dialog a max-width, max-height and margins of its
      // own; each is replaced here so the phone sheet reaches both edges.
      className="mx-0 mt-auto mb-0 max-h-[calc(100svh-1rem)] w-full max-w-none rounded-t-xl border bg-card p-0 text-card-foreground shadow-lg backdrop:bg-black/50 sm:m-auto sm:w-[calc(100vw-2rem)] sm:max-w-lg sm:rounded-xl"
    >
      {phase === "sent" ? (
        <p role="status" className="px-5 py-10 text-center text-sm font-medium">
          Sent — thanks
        </p>
      ) : (
        <form
          className="flex max-h-[calc(100svh-1rem)] flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <div className="border-b px-5 py-3">
            <h2 id={headingId} className="text-base font-semibold">
              Report a problem
            </h2>
          </div>

          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-4">
            {screenshot === null ? (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                The screen could not be captured — describe what you see instead.
              </p>
            ) : (
              <Annotator screenshot={screenshot} strokes={strokes} setStrokes={setStrokes} />
            )}

            <div className="grid grid-cols-2 rounded-lg border p-1" role="group" aria-label="Kind">
              {(["bug", "idea"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={kind === option}
                  onClick={() => setKind(option)}
                  className={
                    kind === option
                      ? "h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground"
                      : "h-10 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  }
                >
                  {option === "bug" ? "Bug" : "Idea"}
                </button>
              ))}
            </div>

            <div className="grid gap-1.5">
              <label htmlFor={textId} className="text-sm font-medium">
                What happened?
              </label>
              <textarea
                id={textId}
                value={text}
                maxLength={MAX_TEXT}
                rows={4}
                onChange={(event) => setText(event.target.value)}
                placeholder={
                  kind === "bug"
                    ? "What you did, what you expected, what happened instead"
                    : "What would make this better?"
                }
                // text-base, not text-sm: iOS zooms the page into any input
                // whose text is smaller than 16px, and does not zoom back.
                className="w-full resize-y rounded-md border bg-background px-3 py-2 text-base"
              />
            </div>

            {error !== null && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-md border px-4 text-sm hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSend}
              className="h-10 min-w-20 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {phase === "sending" ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

// The screenshot with a pen over it. Strokes live in the screenshot's own
// pixel space (the SVG's viewBox), so the overlay scales with the image and
// flattening draws exactly what is on screen.
function Annotator({
  screenshot,
  strokes,
  setStrokes,
}: {
  screenshot: HTMLCanvasElement;
  strokes: Stroke[];
  // An updater, not a value: several pointermoves can land between two
  // renders, and each has to extend the stroke the previous one left.
  setStrokes: Dispatch<SetStateAction<Stroke[]>>;
}) {
  const src = useMemo(() => screenshot.toDataURL("image/png"), [screenshot]);
  const drawing = useRef(false);

  const point = (event: PointerEvent<SVGSVGElement>): [number, number] => {
    const box = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - box.left) / box.width) * screenshot.width,
      ((event.clientY - box.top) / box.height) * screenshot.height,
    ];
  };

  return (
    <div className="grid gap-2">
      <div className="flex justify-center rounded-lg bg-muted p-1">
        <div className="relative">
          <img
            src={src}
            alt="Screenshot of the page"
            draggable={false}
            className="block h-auto max-h-[40svh] w-auto max-w-full select-none rounded sm:max-h-[50svh]"
          />
          <svg
            viewBox={`0 0 ${screenshot.width} ${screenshot.height}`}
            className="absolute inset-0 size-full cursor-crosshair touch-none"
            aria-label="Draw on the screenshot"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drawing.current = true;
              const box = event.currentTarget.getBoundingClientRect();
              const width = (PEN_WIDTH * screenshot.width) / box.width;
              const start = point(event);
              setStrokes((current) => [...current, { width, points: [start] }]);
            }}
            onPointerMove={(event) => {
              if (!drawing.current) return;
              const next = point(event);
              setStrokes((current) => {
                const last = current[current.length - 1];
                if (last === undefined) return current;
                return [...current.slice(0, -1), { ...last, points: [...last.points, next] }];
              });
            }}
            onPointerUp={() => {
              drawing.current = false;
            }}
            onPointerCancel={() => {
              drawing.current = false;
            }}
          >
            {strokes.map((stroke, index) => (
              <polyline
                key={index}
                points={(stroke.points.length === 1
                  ? [stroke.points[0], stroke.points[0]]
                  : stroke.points
                ).join(" ")}
                fill="none"
                stroke={STROKE_COLOR}
                strokeWidth={stroke.width}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Draw on it to point at the problem.</p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={strokes.length === 0}
            onClick={() => setStrokes((current) => current.slice(0, -1))}
            className="h-10 rounded-md border px-3 text-sm hover:bg-accent disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            disabled={strokes.length === 0}
            onClick={() => setStrokes([])}
            className="h-10 rounded-md border px-3 text-sm hover:bg-accent disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
