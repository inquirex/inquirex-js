// @vitest-environment happy-dom
//
// The demo page's flow picker. Not shipped in the package, but it is the thing
// every manual test of this widget goes through, so a broken picker costs real
// time before anyone suspects it.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FLOW,
  FLOW_PARAM,
  type DemoFlow,
  discoverFlows,
  flowsFromPaths,
  hrefForFlow,
  installSwitcher,
  resolveSelection,
} from "../demo/switcher.js";

afterEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

const FLOWS: DemoFlow[] = [
  { name: "tax-intake-dark.json", path: "/demo/tax-intake-dark.json" },
  { name: "tax-intake-default.json", path: "/demo/tax-intake-default.json" },
  { name: "theme-test.json", path: "/demo/theme-test.json" },
];

describe("flowsFromPaths", () => {
  it("reduces glob keys to names and served paths", () => {
    expect(flowsFromPaths(["./theme-test.json"])).toEqual([
      { name: "theme-test.json", path: "/demo/theme-test.json" },
    ]);
  });

  it("sorts by file name so the list is stable between runs", () => {
    const names = flowsFromPaths([
      "./theme-test.json",
      "./tax-intake-dark.json",
      "./tax-intake-default.json",
    ]).map((f) => f.name);

    expect(names).toEqual([
      "tax-intake-dark.json",
      "tax-intake-default.json",
      "theme-test.json",
    ]);
  });

  it("ignores anything that is not JSON", () => {
    expect(
      flowsFromPaths(["./switcher.ts", "./README.md", "./a.json"]),
    ).toEqual([{ name: "a.json", path: "/demo/a.json" }]);
  });

  it("de-duplicates a file reached by more than one path", () => {
    expect(
      flowsFromPaths(["./a.json", "/demo/a.json", "../demo/a.json"]),
    ).toHaveLength(1);
  });

  it("returns nothing for an empty folder", () => {
    expect(flowsFromPaths([])).toEqual([]);
  });
});

describe("discoverFlows", () => {
  // Guards the glob pattern itself: a wrong path silently yields an empty
  // dropdown, which reads as "the demo is broken" rather than "the glob is".
  it("finds the definitions actually sitting in demo/", () => {
    const names = discoverFlows().map((f) => f.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain(DEFAULT_FLOW);
    expect(names.every((n) => n.endsWith(".json"))).toBe(true);
  });
});

describe("resolveSelection", () => {
  it("honours an explicit ?flow=", () => {
    expect(resolveSelection("?flow=theme-test.json", FLOWS)?.name).toBe(
      "theme-test.json",
    );
  });

  it("lands on the default flow when the URL names none", () => {
    expect(resolveSelection("", FLOWS)?.name).toBe(DEFAULT_FLOW);
  });

  it("falls back to the default rather than breaking on an unknown name", () => {
    expect(resolveSelection("?flow=does-not-exist.json", FLOWS)?.name).toBe(
      DEFAULT_FLOW,
    );
  });

  it("uses the first flow when the folder has no default", () => {
    const without = FLOWS.filter((f) => f.name !== DEFAULT_FLOW);
    expect(resolveSelection("", without)?.name).toBe("tax-intake-dark.json");
  });

  it("returns null for an empty folder", () => {
    expect(resolveSelection("?flow=x.json", [])).toBeNull();
  });

  it("ignores unrelated query parameters", () => {
    expect(resolveSelection("?debug=1&flow=theme-test.json", FLOWS)?.name).toBe(
      "theme-test.json",
    );
  });
});

describe("hrefForFlow", () => {
  it("sets the flow parameter on an empty query string", () => {
    expect(hrefForFlow("", "theme-test.json")).toBe(
      `?${FLOW_PARAM}=theme-test.json`,
    );
  });

  it("replaces an existing selection rather than appending a second one", () => {
    const href = hrefForFlow("?flow=a.json", "b.json");
    expect(href).toBe("?flow=b.json");
    expect(href.match(/flow=/g)).toHaveLength(1);
  });

  it("preserves other query state across the switch", () => {
    const params = new URLSearchParams(
      hrefForFlow("?debug=1&flow=a.json", "b.json").slice(1),
    );
    expect(params.get("debug")).toBe("1");
    expect(params.get("flow")).toBe("b.json");
  });
});

describe("installSwitcher", () => {
  /** Install against explicit flows and a capturing navigate. */
  function install(search = "", flows: DemoFlow[] = FLOWS) {
    const navigated: string[] = [];
    const result = installSwitcher({
      search,
      flows,
      navigate: (href) => navigated.push(href),
    });
    const select = result.panel.querySelector("select") as HTMLSelectElement;
    return { ...result, select, navigated };
  }

  it("attaches a panel to the body", () => {
    install();
    expect(document.querySelector(".iq-demo-switcher")).not.toBeNull();
  });

  it("lists every flow, in order", () => {
    const { select } = install();
    expect([...select.options].map((o) => o.value)).toEqual([
      "tax-intake-dark.json",
      "tax-intake-default.json",
      "theme-test.json",
    ]);
  });

  it("shows the flow named in the URL as the current selection", () => {
    const { select, selected } = install("?flow=theme-test.json");
    expect(select.value).toBe("theme-test.json");
    expect(selected?.path).toBe("/demo/theme-test.json");
  });

  it("preselects the default flow when the URL names none", () => {
    const { select, selected } = install();
    expect(select.value).toBe(DEFAULT_FLOW);
    expect(selected?.name).toBe(DEFAULT_FLOW);
  });

  it("navigates to the chosen flow on change, which reloads the page", () => {
    const { select, navigated } = install();
    select.value = "theme-test.json";
    select.dispatchEvent(new Event("change"));
    expect(navigated).toEqual(["?flow=theme-test.json"]);
  });

  it("does not reload when the selection has not actually changed", () => {
    const { select, navigated } = install("?flow=theme-test.json");
    select.dispatchEvent(new Event("change"));
    expect(navigated).toEqual([]);
  });

  it("keeps other query state when switching", () => {
    const { select, navigated } = install("?debug=1");
    select.value = "theme-test.json";
    select.dispatchEvent(new Event("change"));
    expect(navigated[0]).toContain("debug=1");
    expect(navigated[0]).toContain("flow=theme-test.json");
  });

  it("renders file names as text, never as markup", () => {
    const { select } = install("", [
      { name: "<img src=x onerror=go()>.json", path: "/demo/x.json" },
    ]);
    // No element was built from the name — it survives intact as a label.
    expect(select.querySelector("img")).toBeNull();
    expect(select.innerHTML).toContain("&lt;img");
    expect(select.options[0].textContent).toBe("<img src=x onerror=go()>.json");
  });

  it("degrades to a disabled control when demo/ holds no flows", () => {
    const { select, selected } = install("", []);
    expect(selected).toBeNull();
    expect(select.disabled).toBe(true);
    expect(select.options[0].textContent).toContain("No flows");
  });

  it("injects its stylesheet exactly once, however often it is installed", () => {
    install();
    install();
    expect(document.querySelectorAll("#iq-demo-switcher-style")).toHaveLength(
      1,
    );
  });

  it("labels the control for screen readers", () => {
    const { select } = install();
    expect(select.getAttribute("aria-label")).toBe("Demo flow definition");
  });

  it("attaches to an explicit container when given one", () => {
    const host = document.createElement("main");
    document.body.appendChild(host);
    const { panel } = installSwitcher({
      container: host,
      search: "",
      flows: FLOWS,
      navigate: () => {},
    });
    expect(panel.parentElement).toBe(host);
  });

  it("assigns location by default, so a real change reloads the page", () => {
    const assign = vi
      .spyOn(globalThis.location, "assign")
      .mockImplementation(() => {});

    const { panel } = installSwitcher({ search: "", flows: FLOWS });
    const select = panel.querySelector("select") as HTMLSelectElement;
    select.value = "theme-test.json";
    select.dispatchEvent(new Event("change"));

    expect(assign).toHaveBeenCalledWith("?flow=theme-test.json");
    assign.mockRestore();
  });
});
