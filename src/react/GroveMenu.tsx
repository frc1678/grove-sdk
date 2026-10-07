import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

// A menu that opens under its button: the shell's hamburger, its help and
// account menus, and anything an app adds beside them.
//
// Built on <dialog> + showModal(), like the tutorial and the report sheet,
// rather than a popover library the SDK does not ship. showModal() puts the
// panel in the top layer above every app's own z-index, makes the page
// behind inert, closes on Escape, and returns focus to the button — the
// things a hand-rolled dropdown gets wrong. The popover attribute would do
// less of it and needs iOS 17; <dialog> has been in Safari since 15.4.

const CloseContext = createContext<() => void>(() => {});

/** Closes the menu the caller is inside. For an item that is not a GroveMenuItem. */
export function useCloseMenu(): () => void {
  return useContext(CloseContext);
}

export function GroveMenu({
  label,
  button,
  buttonClassName,
  panelClassName,
  align = "end",
  children,
}: {
  // The button's accessible name, and its tooltip.
  label: string;
  // What the button shows: an icon, an avatar.
  button: ReactNode;
  buttonClassName?: string;
  panelClassName?: string;
  // Which edge of the button the panel lines up with.
  align?: "start" | "end";
  children: ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });

  // Closed on the spot, not on the next render: an item that opens another
  // dialog (the tutorial, the report sheet) must find this one already out
  // of the top layer, or this one's closing hands focus back to its button
  // after the new dialog has taken it.
  const close = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open === true) dialog.close();
    setOpen(false);
  }, []);

  const show = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect !== undefined) {
      const top = Math.round(rect.bottom + 6);
      setPlace(
        align === "end"
          ? { top, right: Math.max(8, Math.round(window.innerWidth - rect.right)) }
          : { top, left: Math.max(8, Math.round(rect.left)) },
      );
    }
    setOpen(true);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Escape closes the dialog natively, around React; keep the state in step.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    dialog.addEventListener("close", close);
    return () => dialog.removeEventListener("close", close);
  }, [close]);

  // Up and down move between items, as in any menu.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).filter((item) => item.offsetParent !== null);
    if (items.length === 0) return;
    event.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown"
        ? items[(at + 1) % items.length]
        : items[(at - 1 + items.length) % items.length];
    next.focus();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={show}
        className={
          buttonClassName ??
          "relative flex size-9 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent"
        }
      >
        {button}
      </button>
      <dialog
        ref={dialogRef}
        id={panelId}
        aria-label={label}
        // A tap outside the panel lands on the dialog element itself (the
        // backdrop belongs to it), which is how a modal dialog dismisses
        // like a menu.
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        style={{ top: place.top, left: place.left ?? "auto", right: place.right ?? "auto" }}
        className="fixed m-0 max-h-none max-w-none bg-transparent p-0 backdrop:bg-black/40 sm:backdrop:bg-transparent"
      >
        <CloseContext.Provider value={close}>
          <div
            role="menu"
            onKeyDown={onKeyDown}
            style={{ maxHeight: `calc(100svh - ${place.top + 8}px)` }}
            className={
              panelClassName ??
              "w-64 overflow-y-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-xl"
            }
          >
            {children}
          </div>
        </CloseContext.Provider>
      </dialog>
    </>
  );
}

const ITEM =
  "flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent";

/**
 * One row of a GroveMenu. Give it `onSelect` for an action; for a link,
 * pass the link itself as `render` — the app's router Link, so navigating
 * does not reload the page. Either way the menu closes.
 */
export function GroveMenuItem({
  icon,
  children,
  trailing,
  onSelect,
  render,
  active = false,
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  // Right-aligned extra: a count, a version.
  trailing?: ReactNode;
  onSelect?: () => void;
  // (props) => <Link to="…" {...props} /> — spread the props onto the link.
  render?: (props: {
    className: string;
    role: "menuitem";
    onClick: () => void;
    children: ReactNode;
    "aria-current"?: "page";
  }) => ReactNode;
  active?: boolean;
  className?: string;
}) {
  const close = useCloseMenu();
  const classes = [ITEM, active ? "bg-accent font-medium text-accent-foreground" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      {icon !== undefined && (
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&>svg]:size-4">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing !== undefined && <span className="shrink-0 text-xs text-muted-foreground">{trailing}</span>}
    </>
  );
  if (render !== undefined) {
    return render({
      className: classes,
      role: "menuitem",
      onClick: close,
      children: content,
      ...(active ? { "aria-current": "page" as const } : {}),
    });
  }
  return (
    <button
      type="button"
      role="menuitem"
      className={classes}
      onClick={() => {
        close();
        onSelect?.();
      }}
    >
      {content}
    </button>
  );
}

export function GroveMenuSeparator({ className }: { className?: string }) {
  return <div role="separator" className={`-mx-1.5 my-1.5 h-px bg-border ${className ?? ""}`} />;
}

export function GroveMenuLabel({ children }: { children: ReactNode }) {
  return <div className="truncate px-2 pt-1 pb-0.5 text-xs text-muted-foreground">{children}</div>;
}
