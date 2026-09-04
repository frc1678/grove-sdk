import { createContext, useContext } from "react";

// How the tutorial reaches the header. GroveShell publishes this slot;
// a <GroveTutorial> rendered anywhere inside it registers a way to reopen
// itself, and the header shows its help button only while something is
// registered. That is why an app that has no tutorial gets no button
// without passing a flag anywhere.
export type TutorialSlot = { register: (open: (() => void) | null) => void };

// A tutorial rendered outside a GroveShell still works; it just has no
// header to put a button in.
const NO_SLOT: TutorialSlot = { register: () => {} };

export const TutorialSlotContext = createContext<TutorialSlot>(NO_SLOT);

export function useTutorialSlot(): TutorialSlot {
  return useContext(TutorialSlotContext);
}

// The other direction: what a header needs to draw the reopen button. Kept
// separate from the slot so registering a tutorial does not re-render every
// consumer of the button, and so an app can read one without the other.
export const TutorialOpenContext = createContext<(() => void) | null>(null);

export function useReopenTutorial(): (() => void) | null {
  return useContext(TutorialOpenContext);
}
