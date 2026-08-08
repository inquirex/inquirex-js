// @vitest-environment happy-dom
//
// The package entry point — the module a host page loads.
//
// Importing it has side effects on purpose: it registers the custom elements
// and may auto-mount a widget from the loading <script>'s data attributes. So
// each auto-mount case re-imports the module under a freshly arranged
// document, via `vi.resetModules()`, rather than reusing one import.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as api from "../src/index.js";
import { createWidget, mount } from "../src/index.js";
import type { InquirexWidget } from "../src/widget.js";
import { flush, settle } from "./helpers/dom.js";
import { TEXT_FLOW } from "./helpers/flows.js";

// `customElements` is part of the environment, not the module graph, so it
// survives `vi.resetModules()`. Re-importing the entry point would otherwise
// throw on the first `@customElement` it re-evaluates. Keeping the first
// registration is the right resolution: the tag stays bound to one class, and
// re-imported modules still drive it through `document.createElement`.
const nativeDefine = customElements.define.bind(customElements);

beforeAll(() => {
  customElements.define = ((
    name: string,
    ctor: CustomElementConstructor,
    options?: ElementDefinitionOptions,
  ) => {
    if (customElements.get(name)) return;
    nativeDefine(name, ctor, options);
  }) as typeof customElements.define;
});

afterAll(() => {
  customElements.define = nativeDefine;
});

beforeEach(() => {
  // Mounting a configured widget makes it fetch. Nothing here should reach a
  // real network, so the default is a stub that fails loudly; tests that mean
  // to exercise a request install their own.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      throw new Error(`unexpected network call to ${url}`);
    }),
  );
});

afterEach(() => {
  document.body.innerHTML = "";
  window.InquirexConfig = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createWidget", () => {
  it("builds an unattached <inquirex-widget>", () => {
    const el = createWidget({ url: "https://example.com/flow.json" });
    expect(el.localName).toBe("inquirex-widget");
    expect(el.isConnected).toBe(false);
  });

  it("copies every configured field onto the element", () => {
    const el = createWidget({
      url: "https://example.com/flow.json",
      submitUrl: "https://example.com/answers",
      llmUrl: "https://example.com/llm",
      llmTimeout: 5000,
      auth: "tok-1",
      origins: ["https://a.example"],
      trigger: "delay",
      triggerDelay: 250,
      position: "bottom-left",
      theme: { brand: "#123456" },
    });

    expect(el.url).toBe("https://example.com/flow.json");
    expect(el.submitUrl).toBe("https://example.com/answers");
    expect(el.llmUrl).toBe("https://example.com/llm");
    expect(el.llmTimeout).toBe(5000);
    expect(el.auth).toBe("tok-1");
    expect(el.origins).toEqual(["https://a.example"]);
    expect(el.trigger).toBe("delay");
    expect(el.triggerDelay).toBe(250);
    expect(el.position).toBe("bottom-left");
    expect(el.themeOverrides).toEqual({ brand: "#123456" });
  });

  it("applies the documented defaults for anything omitted", () => {
    const el = createWidget({});
    expect(el.url).toBe("");
    expect(el.flowJson).toBe("");
    expect(el.submitUrl).toBe("");
    expect(el.llmUrl).toBe("");
    expect(el.auth).toBe("");
    expect(el.llmTimeout).toBe(20000);
    expect(el.trigger).toBe("click");
    expect(el.triggerDelay).toBe(1000);
    expect(el.position).toBe("bottom-right");
    expect(el.origins).toEqual([]);
  });

  it("passes a JSON string definition through untouched", () => {
    const json = JSON.stringify(TEXT_FLOW);
    expect(createWidget({ json }).flowJson).toBe(json);
  });

  it("serializes an object definition", () => {
    const el = createWidget({ json: TEXT_FLOW });
    expect(JSON.parse(el.flowJson)).toEqual(TEXT_FLOW);
  });

  it("leaves flowJson empty when no definition is given", () => {
    expect(createWidget({ url: "x" }).flowJson).toBe("");
  });
});

describe("mount", () => {
  it("attaches the widget to document.body by default", async () => {
    const el = mount({ json: TEXT_FLOW });
    await flush(el);
    expect(el.parentElement).toBe(document.body);
    expect(el.shadowRoot?.querySelector(".bubble")).not.toBeNull();
  });

  it("attaches to an explicit container when one is given", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const el = mount({ json: TEXT_FLOW }, host);
    await settle(el);
    expect(el.parentElement).toBe(host);
  });

  it("merges window.InquirexConfig underneath the explicit argument", async () => {
    window.InquirexConfig = {
      llmUrl: "https://example.com/llm",
      auth: "from-window",
    };
    const el = mount({ json: TEXT_FLOW, auth: "explicit" });
    await settle(el);

    expect(el.auth).toBe("explicit");
    expect(el.llmUrl).toBe("https://example.com/llm");
  });

  it("derives the flow url from a qualified.at site id", async () => {
    const el = mount({ siteId: "abc123" });
    await settle(el);
    expect(el.url).toBe("https://qualified.at/api/flows/abc123");
    expect(el.submitUrl).toBe("https://qualified.at/api/flows/abc123");
  });

  it("mounts with no arguments at all without throwing", async () => {
    const el = mount();
    await settle(el);
    expect(el.parentElement).toBe(document.body);
  });
});

/**
 * Auto-mount reads `document.currentScript` at module-evaluation time, which
 * is null under a test runner. These cases therefore drive it through the
 * other config sources the same resolver consults.
 */
describe("auto-mount on import", () => {
  /** Re-evaluate the entry module against the document as arranged. */
  async function importEntry() {
    vi.resetModules();
    await import("../src/index.js");
    await flush();
  }

  afterEach(() => {
    vi.resetModules();
  });

  it("mounts nothing when no flow source is configured", async () => {
    await importEntry();
    expect(document.querySelector("inquirex-widget")).toBeNull();
  });

  it("mounts from window.InquirexConfig when it names a flow", async () => {
    window.InquirexConfig = { url: "https://example.com/flow.json" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => TEXT_FLOW })),
    );

    await importEntry();
    const el = document.querySelector<InquirexWidget>("inquirex-widget");
    expect(el).not.toBeNull();
    expect(el?.url).toBe("https://example.com/flow.json");
  });

  it("mounts from an inline JSON definition", async () => {
    window.InquirexConfig = { json: TEXT_FLOW };
    await importEntry();

    const el = document.querySelector<InquirexWidget>("inquirex-widget");
    expect(el).not.toBeNull();
    await flush(el ?? undefined);
    expect(el?.shadowRoot?.querySelector(".bubble")).not.toBeNull();
  });

  it("carries trigger and position through to the mounted element", async () => {
    window.InquirexConfig = {
      json: TEXT_FLOW,
      trigger: "auto",
      position: "bottom-left",
    };
    await importEntry();

    const el = document.querySelector<InquirexWidget>("inquirex-widget");
    expect(el?.trigger).toBe("auto");
    expect(el?.getAttribute("position")).toBe("bottom-left");
  });

  it("waits for DOMContentLoaded when the document is still parsing", async () => {
    const readyState = vi
      .spyOn(document, "readyState", "get")
      .mockReturnValue("loading");
    window.InquirexConfig = { json: TEXT_FLOW };

    await importEntry();
    // Still parsing: nothing has been appended to a body that may not be
    // finished yet.
    expect(document.querySelector("inquirex-widget")).toBeNull();

    readyState.mockReturnValue("complete");
    document.dispatchEvent(new Event("DOMContentLoaded"));
    await flush();

    expect(document.querySelector("inquirex-widget")).not.toBeNull();
  });
});

// These are the names the README and the IIFE global promise. Naming each one
// statically is deliberate: a dynamic lookup over the namespace would keep
// passing after a rename, which is exactly the break worth catching.
describe("the public API surface", () => {
  it("re-exports the engine, rules and server verb helpers", () => {
    expect(api.FlowEngine).toBeTypeOf("function");
    expect(api.evaluateRule).toBeTypeOf("function");
    expect(api.accumulationContribution).toBeTypeOf("function");
    expect(api.runServerVerb).toBeTypeOf("function");
  });

  it("re-exports the theme helpers", () => {
    expect(api.applyTheme).toBeTypeOf("function");
    expect(api.applyThemeOverrides).toBeTypeOf("function");
    expect(api.contrastColor).toBeTypeOf("function");
    expect(api.darken).toBeTypeOf("function");
  });

  it("re-exports the config helpers", () => {
    expect(api.resolveConfig).toBeTypeOf("function");
    expect(api.mergeConfigs).toBeTypeOf("function");
    expect(api.readScriptConfig).toBeTypeOf("function");
    expect(api.hasFlowSource).toBeTypeOf("function");
  });

  it("re-exports the widget class and registers its tag", () => {
    expect(customElements.get("inquirex-widget")).toBe(api.InquirexWidget);
  });

  it("registers every input sub-component as a side effect", () => {
    for (const tag of [
      "iq-text-input",
      "iq-number-input",
      "iq-enum-select",
      "iq-multi-enum",
      "iq-boolean-input",
    ]) {
      expect(customElements.get(tag)).toBeTypeOf("function");
    }
  });
});
