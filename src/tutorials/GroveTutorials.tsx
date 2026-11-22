import type { ConvexReactClient, Watch } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TutorialRole } from "../build/tutorialCatalog";
import { groveApi, type TutorialProgress } from "../react/api";
import { useMe } from "../react/guards";
import { useGrove } from "../react/provider";
import { useTutorialSlot } from "../react/tutorialSlot";
import { TutorialRunner } from "./TutorialRunner";
import type { Tutorial } from "./types";

// An app's hands-on tutorials. Put it inside GroveShell, beside the page
// outlet, in a layout that stays mounted across every route a tutorial
// visits:
//
//   <GroveShell nav={nav} …>
//     <Outlet />
//     <GroveTutorials tutorials={tutorials} pathname={pathname} navigate={navigate} />
//   </GroveShell>
//
// The menu grows a "Tutorials" item that opens the list. Starting one puts
// the app in tutorial mode: the app's Convex client stops sending writes
// and layers the practice changes over the live data (../sandbox). Finishing
// one is recorded with the Grove, which keeps the points.

export type GroveTutorialsProps = {
  // From defineTutorials(catalog, scripts) in src/tutorials.tsx.
  tutorials: readonly Tutorial[];
  // The router's current path ("/events") and its navigate.
  pathname: string;
  navigate: (to: string) => void;
  // Where the Grove is, for the link to its Tutorials page.
  groveHref?: string;
};

// What this person has finished, from the Grove. Watched directly and never
// thrown: an older Grove has no such function, and tutorials must still run
// there, only without the ticks.
export function useTutorialProgress(
  client: ConvexReactClient,
  enabled: boolean,
): TutorialProgress | undefined {
  const [progress, setProgress] = useState<TutorialProgress | undefined>(undefined);
  useEffect(() => {
    if (!enabled) {
      setProgress(undefined);
      return;
    }
    const watch = (client.watchQuery as (q: unknown, a: unknown) => Watch<TutorialProgress>)(
      groveApi.tutorials.mine,
      {},
    );
    const read = () => {
      try {
        const value = watch.localQueryResult();
        if (value !== undefined) setProgress(value);
      } catch {
        // No ticks and no points shown is the whole cost.
      }
    };
    read();
    return watch.onUpdate(read);
  }, [client, enabled]);
  return progress;
}

export function GroveTutorials({ tutorials, pathname, navigate, groveHref = "/" }: GroveTutorialsProps) {
  const { app, grove, appName, appSlug, isAuthenticated } = useGrove();
  const me = useMe();
  const slot = useTutorialSlot();
  const progress = useTutorialProgress(grove, isAuthenticated);
  const completed = useMemo(
    () =>
      progress === undefined
        ? undefined
        : new Set(progress.completed.filter((row) => row.app === appSlug).map((row) => row.tutorial)),
    [progress, appSlug],
  );
  const onComplete = useCallback(
    (tutorial: Tutorial) => {
      // The Grove's client, never the app's: this is the one write that
      // must leave the browser while the app's sandbox is open.
      grove.mutation(groveApi.tutorials.complete, { app: appSlug, tutorial: tutorial.id }).catch(() => {
        // An older Grove, or offline: the tutorial still ran.
      });
    },
    [grove, appSlug],
  );
  const register = useCallback(
    (open: (() => void) | null, badge?: string) => slot.registerTutorials?.(open, badge),
    [slot],
  );
  if (me?.status !== "active") return null;
  return (
    <TutorialRunner
      sandbox={app.sandbox}
      appName={appName}
      tutorials={tutorials}
      role={(me.effectiveRole ?? me.role) as TutorialRole | undefined}
      completed={completed}
      onComplete={onComplete}
      pathname={pathname}
      navigate={navigate}
      allHref={`${groveHref.replace(/\/$/, "")}/tutorials`}
      register={register}
    />
  );
}
