import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { GroveMenu, GroveMenuItem, GroveMenuLabel } from "./GroveMenu";

// The toolbar over every Grove table or list worth filtering, the way
// Notion and Airtable do it: a search box and four buttons — Filter, Sort,
// Group, and ••• — instead of a row of dropdowns per field. What is
// active shows as chips under it, each with an ✕, so a phone spends one
// row on the controls and one on what they are set to, not a third of
// the screen on dropdowns.
//
// The page keeps its own state and its own filtering: this draws the
// controls and reports changes. Values are strings so they sit in the URL
// as they are.
//
// - Phone: the buttons are icons; Filter opens a sheet from the bottom.
// - From 640px: the buttons carry labels; Filter opens under its button.

export type ToolbarOption = {
  value: string;
  label: ReactNode;
  // What a chip says when `label` is not plain text (a badge, a swatch).
  text?: string;
};

export type ToolbarFilter = { key: string; label: string } & (
  | {
      options: ToolbarOption[];
      // Selected values; empty is "any".
      values: string[];
      onChange: (values: string[]) => void;
      // One value at a time, for fields where several make no sense.
      single?: boolean;
      custom?: undefined;
    }
  | {
      // A field that is not a list to pick from — a date range. The page
      // draws its controls; the toolbar shows them when the field is open
      // and puts `summary` on the chip.
      custom: { content: ReactNode; summary: string | null; clear: () => void };
    }
);

export type ToolbarSort = {
  options: { key: string; label: string }[];
  value: { key: string; dir: 1 | -1 };
  onChange: (value: { key: string; dir: 1 | -1 }) => void;
  // The page's natural order. Any other sort shows as a chip that puts it back.
  defaultKey: string;
  defaultDir?: 1 | -1;
};

export type ToolbarGroup = {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  // The option that means "no grouping".
  noneKey: string;
};

export type TableToolbarProps = {
  search?: { value: string; onChange: (value: string) => void; placeholder?: string; label?: string };
  filters?: ToolbarFilter[];
  sort?: ToolbarSort;
  group?: ToolbarGroup;
  // GroveMenuItems for the ••• menu: show archived, export, reset.
  more?: ReactNode;
  // "41 of 94 parts". Beside the buttons from 640px, above the table on a phone.
  count?: ReactNode;
  // The page's one main action ("New part"): a + on a phone.
  primary?: { label: string; onClick: () => void; icon?: ReactNode };
  // Extra chips the page wants on the chip row (a non-filter state like
  // "Abandoned shown").
  chips?: ReactNode;
  // Clears every filter in one go. Pages whose filters live in the URL need
  // it: clearing them one by one calls the router's setSearchParams once per
  // filter, each built from the same render's params, so only the last one
  // sticks. Without it, Clear all calls each filter's onChange([]) in turn,
  // which is fine for state held in useState.
  onClearAll?: () => void;
};

function isActive(filter: ToolbarFilter): boolean {
  return filter.custom !== undefined ? filter.custom.summary !== null : filter.values.length > 0;
}

function clear(filter: ToolbarFilter) {
  if (filter.custom !== undefined) filter.custom.clear();
  else filter.onChange([]);
}

function optionText(option: ToolbarOption): string {
  return option.text ?? (typeof option.label === "string" ? option.label : option.value);
}

function summary(filter: ToolbarFilter): string | null {
  if (filter.custom !== undefined) return filter.custom.summary;
  if (filter.values.length === 0) return null;
  const names = filter.values.map((value) => {
    const option = filter.options.find((entry) => entry.value === value);
    return option === undefined ? value : optionText(option);
  });
  return names.length <= 2 ? names.join(", ") : `${names[0]} +${names.length - 1}`;
}

const BUTTON =
  "relative inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors sm:h-8 sm:px-2.5 max-sm:w-9";
const IDLE = "border-input text-foreground/90 hover:bg-accent";
const ON = "border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300";

export function TableToolbar({ search, filters = [], sort, group, more, count, primary, chips, onClearAll }: TableToolbarProps) {
  const activeFilters = filters.filter(isActive);
  const sorted =
    sort !== undefined && (sort.value.key !== sort.defaultKey || sort.value.dir !== (sort.defaultDir ?? 1));
  const grouped = group !== undefined && group.value !== group.noneKey;
  const groupLabel = group?.options.find((option) => option.key === group.value)?.label;
  const clearAll = () => {
    if (onClearAll !== undefined) {
      onClearAll();
      return;
    }
    for (const filter of activeFilters) clear(filter);
  };
  const showChips = activeFilters.length > 0 || sorted || chips !== undefined;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        {search !== undefined && (
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-input px-2.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/50 sm:h-8 sm:max-w-80">
            <SearchIcon className="size-4 shrink-0" />
            <input
              type="search"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={search.placeholder ?? "Search…"}
              aria-label={search.label ?? "Search"}
              className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
            />
          </label>
        )}
        {filters.length > 0 && <FilterButton filters={filters} onClearAll={clearAll} />}
        {sort !== undefined && (
          <GroveMenu
            label="Sort"
            align="start"
            buttonClassName={`${BUTTON} ${sorted ? ON : IDLE}`}
            button={
              <>
                <SortIcon className="size-4" />
                <span className="max-sm:sr-only">Sort</span>
              </>
            }
          >
            <GroveMenuLabel>Sort by — again to reverse</GroveMenuLabel>
            {sort.options.map((option) => {
              const current = sort.value.key === option.key;
              return (
                <GroveMenuItem
                  key={option.key}
                  active={current}
                  trailing={current ? (sort.value.dir === 1 ? "↑" : "↓") : undefined}
                  onSelect={() =>
                    sort.onChange(
                      current
                        ? { key: option.key, dir: sort.value.dir === 1 ? -1 : 1 }
                        : { key: option.key, dir: 1 },
                    )
                  }
                >
                  {option.label}
                </GroveMenuItem>
              );
            })}
          </GroveMenu>
        )}
        {group !== undefined && (
          <GroveMenu
            label="Group"
            align="start"
            buttonClassName={`${BUTTON} ${grouped ? ON : IDLE}`}
            button={
              <>
                <GroupIcon className="size-4" />
                <span className="max-sm:sr-only">
                  {grouped ? <>Group: {groupLabel}</> : "Group"}
                </span>
              </>
            }
          >
            <GroveMenuLabel>Group by</GroveMenuLabel>
            {group.options.map((option) => (
              <GroveMenuItem
                key={option.key}
                active={group.value === option.key}
                trailing={group.value === option.key ? "✓" : undefined}
                onSelect={() => group.onChange(option.key)}
              >
                {option.label}
              </GroveMenuItem>
            ))}
          </GroveMenu>
        )}
        {more !== undefined && (
          <GroveMenu
            label="More"
            buttonClassName={`${BUTTON} ${IDLE} sm:w-8 sm:px-0`}
            button={<MoreIcon className="size-4" />}
          >
            {more}
          </GroveMenu>
        )}
        {count !== undefined && (
          <span className="ml-auto hidden shrink-0 text-sm whitespace-nowrap text-muted-foreground sm:inline">{count}</span>
        )}
        {primary !== undefined && (
          <button
            type="button"
            onClick={primary.onClick}
            title={primary.label}
            className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 sm:h-8 sm:px-3 max-sm:w-9 ${count === undefined ? "ml-auto" : ""}`}
          >
            {primary.icon ?? <PlusIcon className="size-4" />}
            <span className="max-sm:sr-only">{primary.label}</span>
          </button>
        )}
      </div>

      {/* One row: on a phone it scrolls sideways rather than wrapping into
          a second and third. */}
      {showChips && (
        <div
          role="group"
          aria-label="Active filters"
          className="-mx-4 flex min-w-0 items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {activeFilters.map((filter) => (
            <span
              key={filter.key}
              className="inline-flex h-7 max-w-64 shrink-0 items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 pr-1 pl-2.5 text-[0.8125rem] text-sky-900 dark:text-sky-100"
            >
              <span className="text-sky-700/80 dark:text-sky-300/80">{filter.label}</span>
              <span className="truncate">{summary(filter)}</span>
              <button
                type="button"
                onClick={() => clear(filter)}
                aria-label={`Clear ${filter.label}`}
                className="flex size-5 shrink-0 items-center justify-center rounded-full hover:bg-sky-500/20"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
          {sort !== undefined && sorted && (
            <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-input pr-1 pl-2.5 text-[0.8125rem]">
              {sort.value.dir === 1 ? "↑" : "↓"} {sort.options.find((option) => option.key === sort.value.key)?.label}
              <button
                type="button"
                onClick={() => sort.onChange({ key: sort.defaultKey, dir: sort.defaultDir ?? 1 })}
                aria-label="Back to the usual order"
                className="flex size-5 shrink-0 items-center justify-center rounded-full hover:bg-accent"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          )}
          {chips}
          {activeFilters.length > 1 && (
            <button
              type="button"
              onClick={clearAll}
              className="h-7 shrink-0 px-1.5 text-[0.8125rem] text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
      )}
      {count !== undefined && <div className="-mt-0.5 text-xs text-muted-foreground sm:hidden">{count}</div>}
    </div>
  );
}

// The Filter button and its panel: every field as a row; tap one to show
// its values as pills to tick. A sheet from the bottom on a phone, under
// the button from 640px. Built on <dialog> like the shell's menus.
function FilterButton({ filters, onClearAll }: { filters: ToolbarFilter[]; onClearAll: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [top, setTop] = useState(0);
  const [left, setLeft] = useState(0);
  const count = filters.filter(isActive).length;

  const close = useCallback(() => {
    if (dialogRef.current?.open === true) dialogRef.current.close();
    setOpen(false);
  }, []);

  const show = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect !== undefined) {
      setTop(Math.round(rect.bottom + 6));
      setLeft(Math.max(8, Math.min(Math.round(rect.left), window.innerWidth - 360)));
    }
    // Open on the first field already set, or none.
    setExpanded(filters.find(isActive)?.key ?? null);
    setOpen(true);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    dialog.addEventListener("close", close);
    return () => dialog.removeEventListener("close", close);
  }, [close]);

  const toggle = (filter: ToolbarFilter, value: string) => {
    if (filter.custom !== undefined) return;
    if (filter.single === true) {
      filter.onChange(filter.values[0] === value ? [] : [value]);
      return;
    }
    filter.onChange(
      filter.values.includes(value) ? filter.values.filter((entry) => entry !== value) : [...filter.values, value],
    );
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={show}
        title="Filter"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${BUTTON} ${count > 0 ? ON : IDLE}`}
      >
        <FilterIcon className="size-4" />
        <span className="max-sm:sr-only">Filter</span>
        {count > 0 && (
          <span className="flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-sky-500 px-1 text-[0.625rem] font-semibold text-white max-sm:absolute max-sm:-top-1.5 max-sm:-right-1.5 max-sm:ring-2 max-sm:ring-background">
            {count}
          </span>
        )}
      </button>
      <dialog
        ref={dialogRef}
        aria-label="Filter"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        style={{ top, left }}
        // A sheet from the bottom on a phone (the !-marked classes beat the
        // inline position), a panel under the button above that.
        className="fixed m-0 max-h-none w-[22rem] max-w-[calc(100vw-1rem)] bg-transparent p-0 backdrop:bg-black/50 sm:backdrop:bg-transparent max-sm:!inset-x-0 max-sm:!top-auto max-sm:!bottom-0 max-sm:w-full max-sm:max-w-none"
      >
        <div
          className="flex flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl max-sm:max-h-[85svh] max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0"
          style={{ maxHeight: `calc(100svh - ${top + 8}px)` }}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-foreground/20 sm:hidden" />
          <div className="relative flex items-center px-4 pt-2.5 pb-2 sm:pt-2">
            <button
              type="button"
              onClick={onClearAll}
              disabled={count === 0}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              Clear all
            </button>
            <span className="absolute left-1/2 -translate-x-1/2 text-base font-semibold">Filter</span>
            <button
              type="button"
              onClick={close}
              className="ml-auto rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Done
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="overflow-hidden rounded-xl border">
              {filters.map((filter, index) => {
                const isOpen = expanded === filter.key;
                const said = summary(filter);
                return (
                  <div key={filter.key} className={index > 0 ? "border-t" : ""}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : filter.key)}
                      className="flex w-full items-center gap-2 px-3.5 py-3 text-left hover:bg-accent/50 sm:py-2.5"
                    >
                      <span className="text-[0.9375rem] sm:text-sm">{filter.label}</span>
                      <span
                        className={`ml-auto min-w-0 truncate text-[0.9375rem] sm:text-sm ${said === null ? "text-muted-foreground" : "text-sky-700 dark:text-sky-300"}`}
                      >
                        {said ?? "Any"}
                      </span>
                      <ChevronIcon className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </button>
                    {isOpen && filter.custom !== undefined && <div className="px-3.5 pb-3">{filter.custom.content}</div>}
                    {isOpen && filter.custom === undefined && (
                      <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto px-3.5 pb-3">
                        {filter.options.length === 0 && <span className="text-sm text-muted-foreground">Nothing to pick yet.</span>}
                        {filter.options.map((option) => {
                          const on = filter.values.includes(option.value);
                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggle(filter, option.value)}
                              className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-sm ${
                                on ? "border-sky-500/50 bg-sky-500/15 text-sky-900 dark:text-sky-100" : "border-input hover:bg-accent"
                              }`}
                            >
                              {on && <CheckIcon className="size-3.5" />}
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}

// Lucide's paths (ISC), inline like the shell's.
function Svg({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}
const SearchIcon = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Svg>
);
const FilterIcon = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M3 6h18M7 12h10M10 18h4" />
  </Svg>
);
const SortIcon = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16" />
  </Svg>
);
const GroupIcon = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <rect width="7" height="5" x="3" y="4" rx="1" />
    <rect width="7" height="5" x="3" y="15" rx="1" />
    <path d="M14 6.5h7M14 17.5h7M14 10h5M14 21h5" />
  </Svg>
);
const MoreIcon = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </Svg>
);
const PlusIcon = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M5 12h14M12 5v14" />
  </Svg>
);
const XIcon = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);
const CheckIcon = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);
const ChevronIcon = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);
