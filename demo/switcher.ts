// Demo-only: a flow picker for the local dev page.
//
// The demo folder holds several flow definitions — a small default, a huge
// one, a couple of theme probes — and previewing another one used to mean
// editing index.html. This puts them in a dropdown instead.
//
// The selection lives in the query string rather than in memory, for three
// reasons: the widget reads its definition once at connect time, so switching
// flows genuinely requires a fresh page; a URL can be bookmarked and pasted
// into a bug report; and reload-and-reread is the same path a real embed
// takes, so the demo keeps exercising the real code.
//
// Nothing here ships. It is not referenced by src/, not part of the bundle,
// and not measured by the package's coverage thresholds.

/** One selectable flow definition from the demo folder. */
export interface DemoFlow {
  /** File name including extension, e.g. `tax-intake-default.json`. */
  name: string;
  /** Server path the widget fetches, e.g. `/demo/tax-intake-default.json`. */
  path: string;
}

/** Query parameter carrying the current selection. */
export const FLOW_PARAM = "flow";

/**
 * Flow used when the URL names none. The folder's alphabetically-first entry
 * is a dark-theme probe, which is a confusing thing to land on.
 */
export const DEFAULT_FLOW = "tax-intake-default.json";

/**
 * Turn raw glob keys into a sorted, de-duplicated flow list.
 *
 * Kept separate from {@link discoverFlows} so it can be tested without a
 * bundler: `import.meta.glob` is resolved at build time and cannot be
 * meaningfully faked.
 *
 * @param paths module paths, as `import.meta.glob` returns them
 * @returns flows sorted by file name
 */
export function flowsFromPaths(paths: string[]): DemoFlow[] {
  const byName = new Map<string, DemoFlow>();

  for (const raw of paths) {
    const name = raw.split("/").pop();
    if (!name?.endsWith(".json")) continue;
    byName.set(name, { name, path: `/demo/${name}` });
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Every flow definition sitting in the demo folder. */
export function discoverFlows(): DemoFlow[] {
  // Eager: we want the keys, not the contents. The widget fetches the file
  // itself, so pulling the JSON into the bundle here would be wasted bytes.
  return flowsFromPaths(Object.keys(import.meta.glob("./*.json")));
}

/**
 * Decide which flow to load for a given query string.
 *
 * Falls back rather than failing: an unknown or missing `?flow=` lands on
 * {@link DEFAULT_FLOW}, and a folder without that file lands on its first
 * entry. A typo in a pasted URL should still show a working demo.
 *
 * @param search the page's query string, e.g. `?flow=theme-test.json`
 * @param flows the available flows
 * @returns the chosen flow, or null when the folder is empty
 */
export function resolveSelection(
  search: string,
  flows: DemoFlow[],
): DemoFlow | null {
  if (flows.length === 0) return null;

  const requested = new URLSearchParams(search).get(FLOW_PARAM);
  return (
    flows.find((f) => f.name === requested) ??
    flows.find((f) => f.name === DEFAULT_FLOW) ??
    flows[0]
  );
}

/**
 * The URL to navigate to in order to load a different flow.
 *
 * Rewrites only the flow parameter, so any other query state the demo picks up
 * later survives the switch.
 */
export function hrefForFlow(currentSearch: string, name: string): string {
  const params = new URLSearchParams(currentSearch);
  params.set(FLOW_PARAM, name);
  return `?${params.toString()}`;
}

const STYLE_ID = "iq-demo-switcher-style";

const PANEL_CSS = `
  .iq-demo-switcher {
    position: fixed;
    bottom: 24px;
    left: 24px;
    z-index: 99998;
    background: #fff;
    border: 1px solid #e7e5e4;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.05);
    padding: 12px 14px;
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    display: flex;
    flex-direction: column;
    gap: 7px;
    max-width: min(320px, calc(100vw - 48px));
  }
  .iq-demo-switcher-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: #a8a29e;
  }
  .iq-demo-switcher select {
    font: inherit;
    font-size: 13px;
    padding: 8px 10px;
    border: 1.5px solid #e7e5e4;
    border-radius: 8px;
    background: #fff;
    color: #1c1917;
    cursor: pointer;
    max-width: 100%;
  }
  .iq-demo-switcher select:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
  }
  .iq-demo-switcher-hint {
    font-size: 11px;
    color: #a8a29e;
  }

  /* The widget claims the bottom-left corner in its own demo. Step aside so
     the two panels never sit on top of each other. */
  @media (max-width: 640px) {
    .iq-demo-switcher { left: 12px; right: 12px; bottom: 12px; }
  }
`;

/** Injectable seams, so the panel can be built and driven in a test. */
export interface SwitcherOptions {
  /** Where to attach the panel. Defaults to `document.body`. */
  container?: HTMLElement;
  /** Current query string. Defaults to `location.search`. */
  search?: string;
  /** Flows to offer. Defaults to {@link discoverFlows}. */
  flows?: DemoFlow[];
  /** How to navigate on change. Defaults to assigning `location`. */
  navigate?: (href: string) => void;
}

/** What {@link installSwitcher} hands back to the demo page. */
export interface InstalledSwitcher {
  /** The flow the page should mount, or null when the folder is empty. */
  selected: DemoFlow | null;
  /** The panel element, so a caller can move or remove it. */
  panel: HTMLElement;
}

/**
 * Build the picker, attach it, and report which flow the page should load.
 *
 * The caller mounts the widget — this function deliberately does not, so the
 * demo page keeps one obvious place where the embed is configured.
 *
 * @example
 *   const { selected } = installSwitcher();
 *   if (selected) mount({ url: selected.path });
 */
export function installSwitcher(
  options: SwitcherOptions = {},
): InstalledSwitcher {
  const container = options.container ?? document.body;
  const search = options.search ?? globalThis.location?.search ?? "";
  const flows = options.flows ?? discoverFlows();
  const navigate =
    options.navigate ??
    ((href: string) => {
      globalThis.location.assign(href);
    });

  const selected = resolveSelection(search, flows);
  const doc = container.ownerDocument;

  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = PANEL_CSS;
    doc.head.appendChild(style);
  }

  const panel = doc.createElement("div");
  panel.className = "iq-demo-switcher";

  const label = doc.createElement("div");
  label.className = "iq-demo-switcher-label";
  label.textContent = "Demo flow";

  const select = doc.createElement("select");
  select.setAttribute("aria-label", "Demo flow definition");

  if (flows.length === 0) {
    const empty = doc.createElement("option");
    empty.textContent = "No flows in demo/";
    select.appendChild(empty);
    select.disabled = true;
  }

  for (const flow of flows) {
    const option = doc.createElement("option");
    option.value = flow.name;
    // textContent, not innerHTML: these are file names off the disk.
    option.textContent = flow.name;
    select.appendChild(option);
  }

  // Set the selection after the options exist. Marking an option `selected`
  // while it is still detached does not survive insertion — the control would
  // show the first file while the page had loaded a different one.
  if (selected) select.value = selected.name;

  select.addEventListener("change", () => {
    if (select.value === selected?.name) return;
    navigate(hrefForFlow(search, select.value));
  });

  const hint = doc.createElement("div");
  hint.className = "iq-demo-switcher-hint";
  hint.textContent = "Switching reloads the page";

  panel.append(label, select, hint);
  container.appendChild(panel);

  return { selected, panel };
}
