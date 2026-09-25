import type { FeedbackSubmission } from "../react/api";
import { MAX_ERRORS, type BufferedError } from "./errorBuffer";

// Everything a report carries besides what the person typed and drew. Pure,
// so what reaches the Grove can be tested without a browser; the provider
// reads window and navigator and hands the values in.

export type ReportContext = FeedbackSubmission["context"];
export type DeviceClass = ReportContext["device"];

// The Grove stores `extra` in a document field, so it is capped there. The
// untruncated copy goes to Sentry as an attachment, where a long replay log
// costs nothing.
export const MAX_EXTRA_LENGTH = 20_000;

// Width decides, except that a phone held sideways is wider than 640px and
// still a phone: a coarse pointer on a short screen counts as one too.
export function deviceClass({
  width,
  height,
  coarsePointer,
}: {
  width: number;
  height: number;
  coarsePointer: boolean;
}): DeviceClass {
  if (width < 640 || (coarsePointer && Math.min(width, height) < 500)) return "phone";
  if (width < 1024) return "tablet";
  return "desktop";
}

// Apps build with `base: "/<slug>/"` because the Grove serves them under
// that path, so the slug is already in every bundle. The Grove itself is
// served from "/".
export function appSlugFromBase(base: string): string {
  const segment = base.split("/").find((part) => part !== "" && part !== ".");
  return segment ?? "grove";
}

export function buildReportContext({
  url,
  version,
  viewport,
  userAgent,
  coarsePointer,
  errors,
  extra,
}: {
  url: string;
  version?: string;
  viewport: ReportContext["viewport"];
  userAgent: string;
  coarsePointer: boolean;
  errors: BufferedError[];
  extra: Record<string, unknown>;
}): { context: ReportContext; fullJson: string } {
  const base: ReportContext = {
    url,
    ...(version !== undefined && version !== "" ? { version } : {}),
    viewport,
    userAgent,
    device: deviceClass({ ...viewport, coarsePointer }),
    consoleErrors: errors.slice(-MAX_ERRORS),
  };
  if (Object.keys(extra).length === 0) {
    return { context: base, fullJson: JSON.stringify(base, null, 2) };
  }
  const extraJson = stringifyExtra(extra);
  return {
    context: { ...base, extra: extraJson.slice(0, MAX_EXTRA_LENGTH) },
    fullJson: JSON.stringify({ ...base, extra: JSON.parse(extraJson) }, null, 2),
  };
}

// `extra` is whatever the app handed useReportContext. A cycle or a BigInt
// in it must not stop the report from being sent — the report button is
// most needed exactly when the app is misbehaving.
function stringifyExtra(extra: Record<string, unknown>): string {
  try {
    return JSON.stringify(extra);
  } catch (error) {
    return JSON.stringify({
      unserialisable: error instanceof Error ? error.message : String(error),
    });
  }
}
