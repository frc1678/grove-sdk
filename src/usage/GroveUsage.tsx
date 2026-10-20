import type { ConvexReactClient } from "convex/react";
import { useCallback, useEffect } from "react";
import { groveApi } from "../react/api";
import {
  activeTracker,
  createUsageTracker,
  setActiveTracker,
  trackGroveEvent,
} from "./tracker";

export type GroveUsageProps = {
  // The GROVE's client: usage goes to the Grove, whichever app records it.
  client: ConvexReactClient;
  // The app's slug, as registered in Admin → Apps.
  app: string;
  // Only while someone is signed in: the Grove counts signed-in use.
  enabled: boolean;
};

// Records page views, and collects useGroveEvent calls, while `enabled`.
// GroveProvider renders one for every app; the Grove, with its own
// provider tree, renders it itself.
export function GroveUsage({ client, app, enabled }: GroveUsageProps): null {
  useEffect(() => {
    if (!enabled) return;
    const tracker = createUsageTracker({
      app,
      send: (batch) => client.mutation(groveApi.usage.record, batch),
    });
    setActiveTracker(tracker);
    tracker.start();
    return () => {
      tracker.stop();
      if (activeTracker() === tracker) setActiveTracker(null);
    };
  }, [client, app, enabled]);
  return null;
}

// const track = useGroveEvent(); … track("mission.created")
export function useGroveEvent(): (name: string) => void {
  return useCallback((name: string) => trackGroveEvent(name), []);
}
