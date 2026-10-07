import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { GroveLinkProps, GroveNavItem } from "./GroveShell";

const state = vi.hoisted(() => ({ reported: 0, signedOut: 0 }));

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
      state.reported += 1;
    },
  }),
}));

const { GroveShell, isNavActive, sectionName } = await import("./GroveShell");
const { PageTitle } = await import("./PageTitle");

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
    const bar = container.querySelector("header")!;
    expect(within(bar).getAllByText("Queue").length).toBeGreaterThan(0);
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
    await act(async () => fireEvent.click(within(menu).getByRole("menuitem", { name: "Report a problem" })));
    expect(menu.open).toBe(false);
    expect(state.reported).toBe(1);
  });

  test("sign out is in the menu", async () => {
    mount("/parts");
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const menu = screen.getByRole("dialog", { name: "Menu" });
    await act(async () => fireEvent.click(within(menu).getByRole("menuitem", { name: "Sign out" })));
    expect(state.signedOut).toBe(1);
  });
});
