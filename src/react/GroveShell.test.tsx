import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { GroveLinkProps, GroveNavItem } from "./GroveShell";

const state = vi.hoisted(() => ({
  reported: 0,
  signedOut: 0,
  onReport: undefined as (() => void) | undefined,
  menuOpenWhenReported: undefined as boolean | undefined,
}));

vi.mock("./provider", () => ({
  useGrove: () => ({
    appName: "Parts",
    signOut: async () => {
      state.signedOut += 1;
    },
  }),
}));
vi.mock("./guards", () => ({ useMe: () => ({ name: "Mike Corsetto", status: "active" }) }));
vi.mock("../report", () => ({
  useReportProblem: () => ({
    open: () => {
      state.onReport?.();
      state.reported += 1;
    },
  }),
}));

const { GroveShell, isNavActive, sectionName } = await import("./GroveShell");
const { PageHeader, PageTitle } = await import("./PageTitle");
const { GroveMenuItem } = await import("./GroveMenu");

const nav: GroveNavItem[] = [
  { to: "/parts", label: "Parts" },
  { to: "/queue", label: "Queue" },
  { to: "/display", label: "Fabrication display", newTab: true },
];

// Stands in for React Router's <Link>.
function Link({ to, ...props }: GroveLinkProps) {
  return <a href={to} {...props} />;
}

beforeEach(() => {
  state.reported = 0;
  state.signedOut = 0;
  state.onReport = undefined;
  state.menuOpenWhenReported = undefined;
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(cleanup);

function mount(pathname: string, children: React.ReactNode = null) {
  return render(
    <GroveShell icon={<span>icon</span>} version="V38.02" nav={nav} pathname={pathname} link={Link}>
      <main>{children}</main>
    </GroveShell>,
  );
}

describe("isNavActive", () => {
  test("a prefix match covers the item's detail pages, not its neighbours", () => {
    expect(isNavActive({ to: "/parts", label: "" }, "/parts/1678-27x-0301")).toBe(true);
    expect(isNavActive({ to: "/parts", label: "" }, "/partsbin")).toBe(false);
  });

  test("the root is only itself, or every page would be under it", () => {
    expect(isNavActive({ to: "/", label: "" }, "/")).toBe(true);
    expect(isNavActive({ to: "/", label: "" }, "/queue")).toBe(false);
  });

  test("an item's own rule wins", () => {
    const item = { to: "/subteams", label: "", match: (p: string) => p.startsWith("/members") };
    expect(isNavActive(item, "/members/7")).toBe(true);
    expect(isNavActive(item, "/subteams")).toBe(false);
  });
});

describe("sectionName", () => {
  test("a page in another tab is never the name of this one", () => {
    expect(sectionName(nav, "/display")).toBeUndefined();
    expect(sectionName(nav, "/queue")).toBe("Queue");
  });
});

describe("GroveShell", () => {
  test("names the page from its nav item when the page gives no title", () => {
    const { container } = mount("/queue");
    const title = container.querySelector("header .group\\/title span");
    expect(title?.textContent).toBe("Queue");
  });

  test("a page's own title goes into the app bar and stays its h1", () => {
    const { container } = mount("/queue", <PageTitle>1678-27x-0301</PageTitle>);
    const bar = container.querySelector("header")!;
    expect(bar.querySelector("[data-page-title]")?.textContent).toBe("1678-27x-0301");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("1678-27x-0301");
  });

  test("shows the version beside the name", () => {
    mount("/parts");
    expect(screen.getByText("V38.02")).toBeDefined();
  });

  test("the menu marks the current page and opens new-tab items in a new tab", () => {
    mount("/queue");
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const menu = screen.getByRole("dialog", { name: "Menu" });
    expect(within(menu).getByRole("menuitem", { name: "Queue" }).getAttribute("aria-current")).toBe("page");
    expect(within(menu).getByRole("menuitem", { name: "Fabrication display" }).getAttribute("target")).toBe(
      "_blank",
    );
  });

  test("choosing an item closes the menu before it acts", async () => {
    mount("/queue");
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const menu = screen.getByRole("dialog", { name: "Menu" }) as HTMLDialogElement;
    expect(menu.open).toBe(true);
    // The order is the point: an item that opens another dialog must find
    // this one already closed, or focus goes back to the menu's button.
    state.onReport = () => {
      state.menuOpenWhenReported = menu.open;
    };
    await act(async () => fireEvent.click(within(menu).getByRole("menuitem", { name: "Report a problem" })));
    expect(state.reported).toBe(1);
    expect(state.menuOpenWhenReported).toBe(false);
  });

  test("Escape (the dialog closing itself) keeps the button's state in step", () => {
    mount("/queue");
    const button = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    act(() => (screen.getByRole("dialog", { name: "Menu" }) as HTMLDialogElement).close());
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  test("a tap outside the panel closes the menu", () => {
    mount("/queue");
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const menu = screen.getByRole("dialog", { name: "Menu" }) as HTMLDialogElement;
    fireEvent.click(menu);
    expect(menu.open).toBe(false);
  });

  test("arrow keys move through the items and wrap", () => {
    mount("/queue");
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const panel = screen.getByRole("menu", { name: "Menu" });
    // jsdom lays nothing out, so offsetParent (the menu's "is it shown"
    // test) is null everywhere; treat everything as shown.
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");
    Object.defineProperty(HTMLElement.prototype, "offsetParent", {
      configurable: true,
      get(this: HTMLElement) {
        return this.parentElement;
      },
    });
    try {
      const items = within(panel).getAllByRole("menuitem");
      items[0].focus();
      fireEvent.keyDown(panel, { key: "ArrowUp" });
      expect(document.activeElement).toBe(items[items.length - 1]);
      fireEvent.keyDown(panel, { key: "ArrowDown" });
      expect(document.activeElement).toBe(items[0]);
    } finally {
      if (original !== undefined) Object.defineProperty(HTMLElement.prototype, "offsetParent", original);
    }
  });

  test("the theme is Light, Dark or System, and System is what an unset theme means", () => {
    const chosen: string[] = [];
    render(
      <GroveShell
        icon={null}
        nav={nav}
        pathname="/parts"
        link={Link}
        theme={{ theme: undefined, resolvedTheme: "dark", setTheme: (theme) => chosen.push(theme) }}
      >
        <main />
      </GroveShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const group = screen.getByRole("group", { name: "Theme" });
    expect(within(group).getByRole("menuitemradio", { name: "System" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(group).getByRole("menuitemradio", { name: "Light" }));
    expect(chosen).toEqual(["light"]);
  });

  test("an app's own menu items appear in the menu", () => {
    render(
      <GroveShell icon={null} nav={nav} pathname="/parts" link={Link} menu={<GroveMenuItem>Preferences</GroveMenuItem>}>
        <main />
      </GroveShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(within(screen.getByRole("dialog", { name: "Menu" })).getByRole("menuitem", { name: "Preferences" })).toBeDefined();
  });

  test("sign out is in the menu", async () => {
    mount("/parts");
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const menu = screen.getByRole("dialog", { name: "Menu" });
    await act(async () => fireEvent.click(within(menu).getByRole("menuitem", { name: "Sign out" })));
    expect(state.signedOut).toBe(1);
  });
});

describe("PageTitle outside a shell", () => {
  test("is a plain, visible h1", () => {
    render(<PageHeader title="Settings" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("Settings");
    expect(heading.className).not.toContain("sr-only");
  });
});
