// @vitest-environment happy-dom
//
// <inquirex-widget> — the element a host page actually embeds.
//
// The engine, rules and server verbs are unit-tested elsewhere; what is left
// here is everything that only exists once there is a DOM: which control gets
// rendered for which data type, how an answer travels from a sub-component
// back into the engine, and what the visitor sees when a flow, a network call
// or a popup blocker fails.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/widget.js";
import type { InquirexWidget } from "../src/widget.js";
import type { FlowDefinition } from "../src/types.js";
import {
  captureEvents,
  flush,
  microflush,
  mountElement,
  settle,
  shadowHtml,
  shadowQuery,
  shadowQueryAll,
  typeInto,
  unmountAll,
  waitFor,
} from "./helpers/dom.js";
import { failingFetch, forbiddenFetch, jsonFetch } from "./helpers/fetch.js";
import {
  CONFIRM_FLOW,
  CURRENCY_FLOW,
  CURRENCY_FLOW as MONEY_FLOW,
  DISPLAY_FLOW,
  ENUM_FLOW,
  MULTI_FLOW,
  SUMMARIZE_FLOW,
  TEXT_FLOW,
  TWO_STEP_FLOW,
  singleStepFlow,
} from "./helpers/flows.js";

/** Mount a widget on an inline flow and let its (async) load settle. */
async function mountWidget(
  flow: FlowDefinition | null,
  props: Partial<InquirexWidget> = {},
): Promise<InquirexWidget> {
  const el = await mountElement<InquirexWidget>("inquirex-widget", {
    ...(flow ? { flowJson: JSON.stringify(flow) } : {}),
    ...props,
  });
  await flush(el);
  return el;
}

/** Mount a widget and open its panel, the state most tests care about. */
async function openWidget(
  flow: FlowDefinition | null,
  props: Partial<InquirexWidget> = {},
): Promise<InquirexWidget> {
  const el = await mountWidget(flow, props);
  shadowQuery<HTMLElement>(el, ".bubble").click();
  await flush(el);
  return el;
}

/** Reach into a sub-component's own shadow root. */
function inner<T extends Element>(
  host: InquirexWidget,
  tag: string,
  selector: string,
): T {
  const component = shadowQuery<HTMLElement>(host, tag);
  const found = component.shadowRoot?.querySelector<T>(selector);
  if (!found) throw new Error(`no ${selector} inside <${tag}>`);
  return found;
}

/** Every bubble of text currently in the conversation. */
function bubbles(el: InquirexWidget): string[] {
  return shadowQueryAll(el, ".bubble-q, .bubble-a").map((b) =>
    (b.textContent ?? "").trim(),
  );
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  // Nothing here should reach a real network. Tests that exercise a request
  // install their own stub over this one.
  vi.stubGlobal("fetch", forbiddenFetch());
});

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("origin allowlist", () => {
  it("runs anywhere when no origins are configured", async () => {
    const el = await mountWidget(TEXT_FLOW);
    expect(el.shadowRoot?.querySelector(".bubble")).not.toBeNull();
  });

  it("runs when the current origin is listed", async () => {
    const el = await mountWidget(TEXT_FLOW, {
      origins: [globalThis.location.origin],
    });
    expect(el.shadowRoot?.querySelector(".bubble")).not.toBeNull();
  });

  it("renders nothing at all on a non-allowlisted origin", async () => {
    const el = await mountWidget(TEXT_FLOW, {
      origins: ["https://not-this-site.example"],
    });
    // lit leaves an empty comment marker where the template would go; what
    // matters is that no launcher and no panel were ever built.
    expect(el.shadowRoot?.querySelector("*")).toBeNull();
    expect(el.shadowRoot?.querySelector(".bubble")).toBeNull();
  });

  it("makes no request on a non-allowlisted origin", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await mountWidget(null, {
      url: "https://example.com/flow.json",
      origins: ["https://not-this-site.example"],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says why it refused, naming the origin and the allowlist", async () => {
    await mountWidget(TEXT_FLOW, {
      origins: ["https://a.example", "https://b.example"],
    });
    const message = String(warnSpy.mock.calls[0]?.[0] ?? "");
    expect(message).toContain("[inquirex]");
    expect(message).toContain(globalThis.location.origin);
    expect(message).toContain("https://a.example, https://b.example");
  });
});

describe("loading the flow definition", () => {
  it("parses an inline JSON definition without any fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const el = await openWidget(TWO_STEP_FLOW);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(bubbles(el)).toContain("What is your name?");
  });

  it("fetches the definition from a url", async () => {
    const fetchMock = jsonFetch(TWO_STEP_FLOW);
    vi.stubGlobal("fetch", fetchMock);

    const el = await openWidget(null, { url: "https://example.com/flow.json" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/flow.json",
      expect.anything(),
    );
    expect(bubbles(el)).toContain("What is your name?");
  });

  it("sends a bearer token with the definition request when configured", async () => {
    const fetchMock = jsonFetch(TEXT_FLOW);
    vi.stubGlobal("fetch", fetchMock);

    await mountWidget(null, {
      url: "https://example.com/flow.json",
      auth: "tok-123",
    });
    expect(fetchMock.mock.calls[0][1]).toEqual({
      headers: { Authorization: "Bearer tok-123" },
    });
  });

  it("sends no Authorization header when there is no token", async () => {
    const fetchMock = jsonFetch(TEXT_FLOW);
    vi.stubGlobal("fetch", fetchMock);

    await mountWidget(null, { url: "https://example.com/flow.json" });
    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: {} });
  });

  it("surfaces an HTTP failure as a readable message", async () => {
    vi.stubGlobal("fetch", jsonFetch({}, false, 404));
    const el = await openWidget(null, { url: "https://example.com/flow.json" });
    expect(shadowHtml(el)).toContain("HTTP 404");
  });

  it("surfaces a network error", async () => {
    vi.stubGlobal("fetch", failingFetch("network down"));
    const el = await openWidget(null, { url: "https://example.com/flow.json" });
    expect(shadowHtml(el)).toContain("network down");
  });

  it("complains when neither url nor json is configured", async () => {
    const el = await openWidget(null);
    expect(shadowHtml(el)).toContain("Provide a url or json config");
  });

  it("reports malformed inline JSON instead of rendering a broken panel", async () => {
    const el = await mountElement<InquirexWidget>("inquirex-widget", {
      flowJson: "{ not json",
    });
    await flush(el);
    shadowQuery<HTMLElement>(el, ".bubble").click();
    await flush(el);
    // The exact parser message varies by engine; what matters is that one is
    // shown rather than swallowed.
    expect(shadowQuery(el, ".conversation").textContent).not.toBe("");
    expect(el.shadowRoot?.querySelector(".input-area")).toBeNull();
  });

  it("stops showing the loading line once the flow has arrived", async () => {
    const el = await openWidget(TEXT_FLOW);
    expect(shadowHtml(el)).not.toContain("Loading...");
  });
});

describe("panel open and close", () => {
  it("starts closed, showing only the launcher", async () => {
    const el = await mountWidget(TEXT_FLOW);
    expect(el.shadowRoot?.querySelector(".panel")).toBeNull();
    expect(shadowQuery(el, ".bubble").getAttribute("aria-label")).toBe(
      "Open questionnaire",
    );
  });

  it("opens on launcher click and relabels the button", async () => {
    const el = await openWidget(TEXT_FLOW);
    expect(el.shadowRoot?.querySelector(".panel")).not.toBeNull();
    expect(shadowQuery(el, ".bubble").getAttribute("aria-label")).toBe(
      "Close questionnaire",
    );
  });

  it("drops the attention pulse once the visitor has engaged", async () => {
    const el = await mountWidget(TEXT_FLOW);
    expect(shadowQuery(el, ".bubble").classList.contains("has-pulse")).toBe(
      true,
    );
    shadowQuery<HTMLElement>(el, ".bubble").click();
    await flush(el);
    expect(shadowQuery(el, ".bubble").classList.contains("has-pulse")).toBe(
      false,
    );
  });

  it("plays the close animation rather than vanishing", async () => {
    const el = await openWidget(TEXT_FLOW);
    shadowQuery<HTMLElement>(el, ".bubble").click();
    await flush(el);
    // Still mounted — it is animating out, not gone.
    expect(shadowQuery(el, ".panel").classList.contains("closing")).toBe(true);
  });

  it("removes the panel only when the close animation ends", async () => {
    const el = await openWidget(TEXT_FLOW);
    shadowQuery<HTMLElement>(el, ".bubble").click();
    await flush(el);

    const panel = shadowQuery(el, ".panel");
    panel.dispatchEvent(
      new AnimationEvent("animationend", {
        animationName: "panelOut",
        bubbles: true,
      }),
    );
    await flush(el);
    expect(el.shadowRoot?.querySelector(".panel")).toBeNull();
  });

  it("ignores the opening animation's end event", async () => {
    const el = await openWidget(TEXT_FLOW);
    shadowQuery(el, ".panel").dispatchEvent(
      new AnimationEvent("animationend", {
        animationName: "panelIn",
        bubbles: true,
      }),
    );
    await flush(el);
    expect(el.shadowRoot?.querySelector(".panel")).not.toBeNull();
  });

  it("closes from the header X as well as the launcher", async () => {
    const el = await openWidget(TEXT_FLOW);
    shadowQuery<HTMLElement>(el, ".close-btn").click();
    await flush(el);
    expect(shadowQuery(el, ".panel").classList.contains("closing")).toBe(true);
  });
});

describe("open triggers", () => {
  it("waits for a click by default", async () => {
    const el = await mountWidget(TEXT_FLOW);
    expect(el.shadowRoot?.querySelector(".panel")).toBeNull();
  });

  it("opens immediately when trigger is auto", async () => {
    const el = await mountWidget(TEXT_FLOW, { trigger: "auto" });
    expect(el.shadowRoot?.querySelector(".panel")).not.toBeNull();
  });

  it("opens after the configured delay when trigger is delay", async () => {
    vi.useFakeTimers();
    const el = await mountElement<InquirexWidget>("inquirex-widget", {
      flowJson: JSON.stringify(TEXT_FLOW),
      trigger: "delay",
      triggerDelay: 3000,
    });
    await microflush(el);
    expect(el.shadowRoot?.querySelector(".panel")).toBeNull();

    vi.advanceTimersByTime(3000);
    await microflush(el);
    expect(el.shadowRoot?.querySelector(".panel")).not.toBeNull();
  });

  it("does not ambush a visitor who already opened and closed the panel", async () => {
    vi.useFakeTimers();
    const el = await mountElement<InquirexWidget>("inquirex-widget", {
      flowJson: JSON.stringify(TEXT_FLOW),
      trigger: "delay",
      triggerDelay: 3000,
    });
    await microflush(el);

    // Open, then close, all before the delay elapses.
    shadowQuery<HTMLElement>(el, ".bubble").click();
    await microflush(el);
    shadowQuery<HTMLElement>(el, ".bubble").click();
    await microflush(el);
    shadowQuery(el, ".panel").dispatchEvent(
      new AnimationEvent("animationend", {
        animationName: "panelOut",
        bubbles: true,
      }),
    );
    await microflush(el);

    vi.advanceTimersByTime(3000);
    await microflush(el);
    expect(el.shadowRoot?.querySelector(".panel")).toBeNull();
  });
});

describe("panel chrome", () => {
  it("shows the flow's title and subtitle", async () => {
    const el = await openWidget(TWO_STEP_FLOW);
    expect(shadowQuery(el, ".header-title").textContent).toBe(
      "Tax Preparation Intake",
    );
    expect(shadowQuery(el, ".header-subtitle").textContent).toBe(
      "A few quick questions",
    );
  });

  it("falls back to a generic title and omits an absent subtitle", async () => {
    const el = await openWidget(TEXT_FLOW);
    expect(shadowQuery(el, ".header-title").textContent).toBe("Questionnaire");
    expect(el.shadowRoot?.querySelector(".header-subtitle")).toBeNull();
  });

  it("shows a brand logo when the flow supplies one", async () => {
    const el = await openWidget(
      singleStepFlow(
        "a",
        { verb: "say", text: "hi" },
        { meta: { brand: { name: "Agentica", logo: "/logo.png" } } },
      ),
    );
    const img = shadowQuery<HTMLImageElement>(el, ".header-logo img");
    expect(img.getAttribute("src")).toBe("/logo.png");
    expect(img.getAttribute("alt")).toBe("Agentica");
  });

  it("omits the logo block when there is none", async () => {
    const el = await openWidget(TEXT_FLOW);
    expect(el.shadowRoot?.querySelector(".header-logo")).toBeNull();
  });

  it("advances the progress bar as steps are answered", async () => {
    const el = await openWidget(TWO_STEP_FLOW);
    const width = () =>
      shadowQuery<HTMLElement>(el, ".progress-fill").getAttribute("style");
    expect(width()).toContain("width:0%");

    typeInto(inner<HTMLInputElement>(el, "iq-text-input", "input"), "Alan");
    shadowQuery<HTMLElement>(el, ".submit-btn").click();
    await flush(el);
    expect(width()).toContain("width:50%");
  });

  it("credits the platform in the footer", async () => {
    const el = await openWidget(TEXT_FLOW);
    const link = shadowQuery<HTMLAnchorElement>(el, ".footer a");
    expect(link.getAttribute("href")).toBe("https://qualified.at");
    expect(link.getAttribute("rel")).toBe("noopener");
  });
});

describe("choosing a control for each data type", () => {
  it.each([
    ["string", "iq-text-input"],
    ["email", "iq-text-input"],
    ["phone", "iq-text-input"],
    ["date", "iq-text-input"],
    ["text", "iq-text-input"],
    ["integer", "iq-number-input"],
    ["decimal", "iq-number-input"],
    ["currency", "iq-number-input"],
    ["enum", "iq-enum-select"],
    ["multi_enum", "iq-multi-enum"],
    ["boolean", "iq-boolean-input"],
  ])("renders %s with %s", async (type, tag) => {
    const el = await openWidget(
      singleStepFlow("q", {
        verb: "ask",
        type: type as never,
        question: "Q?",
        options: [{ value: "a", label: "A" }],
      }),
    );
    expect(el.shadowRoot?.querySelector(tag)).not.toBeNull();
  });

  it("renders a confirm step as yes/no even though it has no type", async () => {
    const el = await openWidget(CONFIRM_FLOW);
    expect(el.shadowRoot?.querySelector("iq-boolean-input")).not.toBeNull();
  });

  it("gives a short text field an inline send button", async () => {
    const el = await openWidget(TEXT_FLOW);
    expect(el.shadowRoot?.querySelector(".submit-btn")).not.toBeNull();
  });

  it("gives a multiline field a full-width Continue instead", async () => {
    const el = await openWidget(
      singleStepFlow("story", {
        verb: "ask",
        type: "text",
        question: "Tell us",
      }),
    );
    expect(el.shadowRoot?.querySelector(".submit-btn")).toBeNull();
    expect(shadowQuery(el, ".continue-btn").textContent).toContain("Continue");
  });

  it("seeds a numeric control with the step's default", async () => {
    const el = await openWidget(
      singleStepFlow("count", {
        verb: "ask",
        type: "integer",
        question: "How many?",
        default: 3,
      }),
    );
    expect(inner<HTMLInputElement>(el, "iq-number-input", "input").value).toBe(
      "3",
    );
  });

  it.each([
    ["say", "Welcome — this will take two minutes."],
    ["header", "Section one"],
    ["btw", "By the way…"],
    ["warning", "Careful now"],
  ])("renders the display verb %s with a Continue button", async (verb, text) => {
    const el = await openWidget(
      singleStepFlow("d", { verb: verb as never, text }),
    );
    expect(shadowQuery(el, ".continue-btn").textContent).toContain("Continue");
    expect(shadowQuery(el, `.msg-${verb} .bubble-q`).textContent).toBe(text);
  });
});

describe("answering questions", () => {
  it("records a typed answer and shows it back", async () => {
    const el = await openWidget(TWO_STEP_FLOW);
    typeInto(inner<HTMLInputElement>(el, "iq-text-input", "input"), "Alan");
    shadowQuery<HTMLElement>(el, ".submit-btn").click();
    await flush(el);

    expect(bubbles(el)).toContain("Alan");
    expect(bubbles(el)).toContain("Thanks — that is everything.");
  });

  it("ignores a submit with an empty field", async () => {
    const el = await openWidget(TWO_STEP_FLOW);
    shadowQuery<HTMLElement>(el, ".submit-btn").click();
    await flush(el);
    expect(bubbles(el)).not.toContain("Thanks — that is everything.");
  });

  it("ignores a submit of nothing but whitespace", async () => {
    const el = await openWidget(TWO_STEP_FLOW);
    typeInto(inner<HTMLInputElement>(el, "iq-text-input", "input"), "    ");
    shadowQuery<HTMLElement>(el, ".submit-btn").click();
    await flush(el);
    expect(bubbles(el)).not.toContain("Thanks — that is everything.");
  });

  it("falls back to the step default when the field is left empty", async () => {
    const el = await openWidget(
      singleStepFlow("count", {
        verb: "ask",
        type: "integer",
        question: "How many dependents?",
        default: 0,
      }),
    );
    // Clear the seeded default, then submit anyway.
    typeInto(inner<HTMLInputElement>(el, "iq-number-input", "input"), "");
    shadowQuery<HTMLElement>(el, ".submit-btn").click();
    await flush(el);
    expect(bubbles(el)).toContain("0");
  });

  it("submits a single-select on click, showing the label not the value", async () => {
    const el = await openWidget(ENUM_FLOW);
    const option = shadowQuery<HTMLElement>(
      el,
      "iq-enum-select",
    ).shadowRoot?.querySelectorAll<HTMLElement>(".option")[1];
    option?.click();
    await waitFor(250, el);

    expect(bubbles(el)).toContain("Married Filing Jointly");
    expect(bubbles(el)).not.toContain("married_jointly");
  });

  it("waits for Continue on a multi-select and joins the labels", async () => {
    const el = await openWidget(MULTI_FLOW);
    const rows = shadowQuery<HTMLElement>(
      el,
      "iq-multi-enum",
    ).shadowRoot?.querySelectorAll<HTMLElement>(".option");
    rows?.[0].click();
    rows?.[2].click();
    await flush(el);

    shadowQuery<HTMLElement>(el, ".continue-btn").click();
    await flush(el);
    expect(bubbles(el)).toContain("W-2 employment, Rental income");
  });

  it("keeps the multi-select Continue disabled until something is picked", async () => {
    const el = await openWidget(MULTI_FLOW);
    const button = shadowQuery<HTMLButtonElement>(el, ".continue-btn");
    expect(button.hasAttribute("disabled")).toBe(true);

    shadowQuery<HTMLElement>(el, "iq-multi-enum")
      .shadowRoot?.querySelector<HTMLElement>(".option")
      ?.click();
    await flush(el);
    expect(
      shadowQuery<HTMLButtonElement>(el, ".continue-btn").hasAttribute(
        "disabled",
      ),
    ).toBe(false);
  });

  it("renders a boolean answer as Yes or No", async () => {
    const el = await openWidget(CONFIRM_FLOW);
    shadowQuery<HTMLElement>(el, "iq-boolean-input")
      .shadowRoot?.querySelectorAll<HTMLElement>("button")[0]
      .click();
    await waitFor(250, el);
    expect(bubbles(el)).toContain("Yes");
  });

  it("formats a currency answer as money", async () => {
    const el = await openWidget(MONEY_FLOW);
    typeInto(inner<HTMLInputElement>(el, "iq-number-input", "input"), "1250.5");
    shadowQuery<HTMLElement>(el, ".submit-btn").click();
    await flush(el);
    expect(bubbles(el)).toContain("$1,250.50");
  });

  it("enables Continue once something is typed into a multiline field", async () => {
    const el = await openWidget(
      singleStepFlow("story", {
        verb: "ask",
        type: "text",
        question: "Describe your business.",
      }),
    );
    typeInto(
      inner<HTMLTextAreaElement>(el, "iq-text-input", "textarea"),
      "We sell rare books.",
    );
    shadowQuery<HTMLElement>(el, ".continue-btn").click();
    await flush(el);
    expect(bubbles(el)).toContain("We sell rare books.");
  });

  it("does nothing when a numeric field is empty and the step has no default", async () => {
    const el = await openWidget(CURRENCY_FLOW);
    // getValue() is null here, not "" — a distinct branch from the empty
    // string a text field returns.
    shadowQuery<HTMLElement>(el, ".submit-btn").click();
    await flush(el);
    expect(el.shadowRoot?.querySelector("iq-number-input")).not.toBeNull();
    expect(shadowHtml(el)).not.toContain("All done!");
  });

  it("joins a multi-select answer with no options list using its raw values", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetch({ answers: { choices: ["Alpha", "Beta"] }, next: "choices" }),
    );
    const el = await openWidget(
      {
        id: "fixture",
        version: "1.0.0",
        start: "read_it",
        steps: {
          read_it: { verb: "extract", transitions: [{ to: "choices" }] },
          // An author may omit `options` on a multi_enum; the answer still has
          // to render, and there are no labels to fall back on.
          choices: { verb: "ask", type: "multi_enum", question: "Which?" },
        },
      },
      { llmUrl: "https://example.com/llm" },
    );

    shadowQuery<HTMLElement>(el, ".continue-btn").click();
    await flush(el);
    expect(bubbles(el)).toContain("Alpha, Beta");
  });

  it("advances past a display step on Continue", async () => {
    const el = await openWidget(DISPLAY_FLOW);
    shadowQuery<HTMLElement>(el, ".continue-btn").click();
    await flush(el);
    expect(el.shadowRoot?.querySelector(".continue-btn")).toBeNull();
    expect(shadowHtml(el)).toContain("All done!");
  });
});

describe("finishing", () => {
  it("shows the completion screen when a flow ends without a summary", async () => {
    const el = await openWidget(DISPLAY_FLOW);
    shadowQuery<HTMLElement>(el, ".continue-btn").click();
    await flush(el);
    expect(shadowQuery(el, ".complete-text").textContent).toContain(
      "All done!",
    );
  });

  it("POSTs the result when a submit target is configured", async () => {
    const fetchMock = jsonFetch({});
    vi.stubGlobal("fetch", fetchMock);

    const el = await openWidget(DISPLAY_FLOW, {
      submitUrl: "https://example.com/answers",
      auth: "tok-abc",
    });
    shadowQuery<HTMLElement>(el, ".continue-btn").click();
    await flush(el);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.com/answers");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer tok-abc",
    });
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      flow_id: "fixture",
      version: "1.0.0",
      steps_completed: 1,
    });
  });

  it("confirms submission to the visitor once the POST succeeds", async () => {
    vi.stubGlobal("fetch", jsonFetch({}));
    const el = await openWidget(DISPLAY_FLOW, {
      submitUrl: "https://example.com/answers",
    });
    shadowQuery<HTMLElement>(el, ".continue-btn").click();
    await flush(el);
    expect(shadowQuery(el, ".complete-text").textContent).toContain(
      "have been submitted",
    );
  });

  it("keeps the completion screen when the POST fails", async () => {
    vi.stubGlobal("fetch", failingFetch("offline"));
    const el = await openWidget(DISPLAY_FLOW, {
      submitUrl: "https://example.com/answers",
    });
    shadowQuery<HTMLElement>(el, ".continue-btn").click();
    await flush(el);
    // The visitor is not shown a failure they cannot act on; their answers
    // are simply not confirmed as submitted.
    expect(shadowQuery(el, ".complete-text").textContent).toContain(
      "All done!",
    );
  });

  it("does not claim submission on a non-2xx response", async () => {
    vi.stubGlobal("fetch", jsonFetch({}, false, 500));
    const el = await openWidget(DISPLAY_FLOW, {
      submitUrl: "https://example.com/answers",
    });
    shadowQuery<HTMLElement>(el, ".continue-btn").click();
    await flush(el);
    expect(shadowQuery(el, ".complete-text").textContent).toContain(
      "All done!",
    );
  });

  it("falls back to the flow url when no submit target is set", async () => {
    const fetchMock = jsonFetch(DISPLAY_FLOW);
    vi.stubGlobal("fetch", fetchMock);

    const el = await openWidget(null, { url: "https://example.com/flow.json" });
    shadowQuery<HTMLElement>(el, ".continue-btn").click();
    await flush(el);

    const posts = fetchMock.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe("https://example.com/flow.json");
  });

  it("posts nothing when there is nowhere to post", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const el = await openWidget(DISPLAY_FLOW);
    shadowQuery<HTMLElement>(el, ".continue-btn").click();
    await flush(el);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefers an explicit auth token over the flow's session token", async () => {
    const fetchMock = jsonFetch({});
    vi.stubGlobal("fetch", fetchMock);

    const el = await openWidget(
      { ...DISPLAY_FLOW, session: { token: "from-flow" } },
      { submitUrl: "https://example.com/answers", auth: "explicit" },
    );
    shadowQuery<HTMLElement>(el, ".continue-btn").click();
    await flush(el);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer explicit",
    });
  });

  it("uses the flow's session token when no explicit one is given", async () => {
    const fetchMock = jsonFetch({});
    vi.stubGlobal("fetch", fetchMock);

    const el = await openWidget(
      { ...DISPLAY_FLOW, session: { token: "from-flow" } },
      { submitUrl: "https://example.com/answers" },
    );
    shadowQuery<HTMLElement>(el, ".continue-btn").click();
    await flush(el);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer from-flow",
    });
  });
});

describe("server verbs", () => {
  it("shows a thinking indicator with the step's label while working", async () => {
    // No llmUrl configured, so the verb degrades immediately; drive it with a
    // pending fetch to observe the intermediate state.
    let release: (v: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      ),
    );

    const el = await openWidget(SUMMARIZE_FLOW, {
      llmUrl: "https://example.com/llm",
    });
    expect(shadowQuery(el, ".thinking").textContent).toContain(
      "Writing your summary…",
    );

    release({ ok: true, json: async () => ({ summary: "## Done" }) });
    await flush(el);
  });

  it("renders the returned summary as markdown, with Close and Print", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetch({ summary: "## Your situation\n\n- W-2 income" }),
    );
    const el = await openWidget(SUMMARIZE_FLOW, {
      llmUrl: "https://example.com/llm",
    });

    expect(shadowQuery(el, ".summary-body h2").textContent).toBe(
      "Your situation",
    );
    expect(shadowQuery(el, ".summary-body li").textContent).toBe("W-2 income");
    const actions = shadowQueryAll(el, ".summary-actions button").map((b) =>
      b.textContent?.trim(),
    );
    expect(actions).toEqual(["Close", "Print"]);
  });

  it("sanitizes the summary — it is model output, not trusted markup", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetch({
        summary: 'Fine <script>alert(1)</script> <img src=x onerror="go()">',
      }),
    );
    const el = await openWidget(SUMMARIZE_FLOW, {
      llmUrl: "https://example.com/llm",
    });
    const body = shadowQuery(el, ".summary-body").innerHTML;
    expect(body).not.toContain("<script");
    expect(body).not.toContain("onerror");
  });

  it("falls back to the plain completion screen when the LLM call fails", async () => {
    vi.stubGlobal("fetch", failingFetch("llm down"));
    const el = await openWidget(SUMMARIZE_FLOW, {
      llmUrl: "https://example.com/llm",
    });
    expect(el.shadowRoot?.querySelector(".summary-body")).toBeNull();
    expect(shadowQuery(el, ".complete-text").textContent).toContain(
      "All done!",
    );
  });

  it("degrades without a round-trip when no llmUrl is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const el = await openWidget(SUMMARIZE_FLOW);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shadowQuery(el, ".complete-text").textContent).toContain(
      "All done!",
    );
  });

  it("pre-checks extracted multi-select suggestions but still asks", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetch({
        answers: { income_types: ["W-2 employment", "rental"] },
        next: "income_types",
      }),
    );
    const el = await openWidget(
      {
        id: "fixture",
        version: "1.0.0",
        start: "read_it",
        steps: {
          read_it: {
            verb: "extract",
            transitions: [{ to: "income_types" }],
          },
          income_types: MULTI_FLOW.steps.income_types,
        },
      },
      { llmUrl: "https://example.com/llm" },
    );

    // The question is still on screen, with the model's guesses ticked.
    expect(bubbles(el)).toContain("Select all income types.");
    const checked = shadowQuery<HTMLElement>(
      el,
      "iq-multi-enum",
    ).shadowRoot?.querySelectorAll("[data-selected]");
    expect(checked?.length).toBe(2);
  });
});

describe("printing the summary", () => {
  async function summarizedWidget(): Promise<InquirexWidget> {
    vi.stubGlobal("fetch", jsonFetch({ summary: "## Summary\n\nAll good." }));
    return openWidget(
      { ...SUMMARIZE_FLOW, meta: { title: "Tax Preparation Intake" } },
      { llmUrl: "https://example.com/llm" },
    );
  }

  it("opens a print window titled after the flow", async () => {
    const el = await summarizedWidget();
    const written: string[] = [];
    const fakeWindow = {
      document: {
        open() {},
        write: (h: string) => written.push(h),
        close() {},
      },
      focus() {},
      print() {},
      setTimeout: () => 0,
    };
    vi.spyOn(window, "open").mockImplementation(
      () => fakeWindow as unknown as Window,
    );

    shadowQueryAll<HTMLElement>(el, ".summary-actions button")[1].click();
    await flush(el);

    expect(written.join("")).toContain("<title>Tax Preparation Intake</title>");
    expect(written.join("")).toContain("<h2>Summary</h2>");
  });

  it("explains itself when a popup blocker refuses the window", async () => {
    const el = await summarizedWidget();
    vi.spyOn(window, "open").mockImplementation(() => null);

    shadowQueryAll<HTMLElement>(el, ".summary-actions button")[1].click();
    await flush(el);

    expect(shadowHtml(el)).toContain("blocked the print window");
  });

  it("closes the panel from the summary's Close button", async () => {
    const el = await summarizedWidget();
    shadowQueryAll<HTMLElement>(el, ".summary-actions button")[0].click();
    await flush(el);
    expect(shadowQuery(el, ".panel").classList.contains("closing")).toBe(true);
  });
});

describe("theming", () => {
  it("applies the flow's own theme as inline custom properties", async () => {
    const el = await mountWidget(
      singleStepFlow(
        "a",
        { verb: "say", text: "hi" },
        { meta: { theme: { brand: "#f59e0b", radius: "4px" } } },
      ),
    );
    expect(el.style.getPropertyValue("--iq-brand")).toBe("#f59e0b");
    expect(el.style.getPropertyValue("--iq-radius")).toBe("4px");
    // Contrast is derived when the host does not state it.
    expect(el.style.getPropertyValue("--iq-on-brand")).toBe("#1c1917");
  });

  it("lets the embedder's theme win over the flow's", async () => {
    const el = await mountWidget(
      singleStepFlow(
        "a",
        { verb: "say", text: "hi" },
        { meta: { theme: { brand: "#f59e0b" } } },
      ),
      { themeOverrides: { brand: "#2563eb" } },
    );
    expect(el.style.getPropertyValue("--iq-brand")).toBe("#2563eb");
  });

  it("still applies the embedder's theme when the flow fails to load", async () => {
    const el = await mountWidget(null, {
      themeOverrides: { brand: "#111111" },
    });
    expect(el.style.getPropertyValue("--iq-brand")).toBe("#111111");
  });

  it("reflects position so the corner-anchoring CSS can match", async () => {
    const el = await mountWidget(TEXT_FLOW, { position: "bottom-left" });
    expect(el.getAttribute("position")).toBe("bottom-left");
  });
});

describe("developer state inspector", () => {
  it("offers a debug toggle in development builds", async () => {
    const el = await openWidget(TEXT_FLOW);
    expect(el.shadowRoot?.querySelector(".debug-btn")).not.toBeNull();
    expect(el.shadowRoot?.querySelector(".debug-panel")).toBeNull();
  });

  it("shows the POST payload, highlighted, when toggled on", async () => {
    const el = await openWidget(TWO_STEP_FLOW);
    shadowQuery<HTMLElement>(el, ".debug-btn").click();
    await flush(el);

    const panel = shadowQuery(el, ".debug-panel");
    expect(panel.textContent).toContain("POST payload");
    expect(panel.textContent).toContain("flow_id");
    expect(panel.textContent).toContain("fixture");
    // The current step is named, so you can see where the engine is parked.
    expect(panel.textContent).toContain("name");
  });

  it("hides the inspector again when toggled off", async () => {
    const el = await openWidget(TEXT_FLOW);
    shadowQuery<HTMLElement>(el, ".debug-btn").click();
    await flush(el);
    shadowQuery<HTMLElement>(el, ".debug-btn").click();
    await flush(el);
    expect(el.shadowRoot?.querySelector(".debug-panel")).toBeNull();
  });

  it("keeps the payload current as answers come in", async () => {
    const el = await openWidget(TWO_STEP_FLOW);
    shadowQuery<HTMLElement>(el, ".debug-btn").click();
    await flush(el);

    typeInto(inner<HTMLInputElement>(el, "iq-text-input", "input"), "Alan");
    shadowQuery<HTMLElement>(el, ".submit-btn").click();
    await flush(el);

    expect(shadowQuery(el, ".debug-panel").textContent).toContain("Alan");
  });
});

describe("scrolling", () => {
  it("keeps the newest message in view", async () => {
    const el = await openWidget(TWO_STEP_FLOW);
    const conversation = shadowQuery<HTMLElement>(el, ".conversation");
    Object.defineProperty(conversation, "scrollHeight", { value: 999 });

    typeInto(inner<HTMLInputElement>(el, "iq-text-input", "input"), "Alan");
    shadowQuery<HTMLElement>(el, ".submit-btn").click();
    await flush(el);

    expect(shadowQuery<HTMLElement>(el, ".conversation").scrollTop).toBe(
      shadowQuery<HTMLElement>(el, ".conversation").scrollHeight,
    );
  });
});

describe("the element's public surface", () => {
  it("emits nothing and stays inert with no configuration at all", async () => {
    const el = await mountElement<InquirexWidget>("inquirex-widget");
    const events = captureEvents(el, "iq-submit");
    await flush(el);
    expect(events).toHaveLength(0);
    expect(el.shadowRoot?.querySelector(".bubble")).not.toBeNull();
  });

  it("carries the documented property defaults", async () => {
    const el = await mountElement<InquirexWidget>("inquirex-widget");
    await settle(el);
    expect(el.trigger).toBe("click");
    expect(el.triggerDelay).toBe(1000);
    expect(el.position).toBe("bottom-right");
    expect(el.llmTimeout).toBe(20000);
    expect(el.origins).toEqual([]);
    expect(el.autoDismissMs).toBe(3500);
  });
});

describe("keyboard reachability of a display step", () => {
  // A `say` / `header` / `btw` / `warning` step renders no input, so without
  // this focus nothing in the panel is focused and Enter has nothing to act
  // on. Activation itself is the browser's native button behaviour (Enter and
  // Space on a focused <button>), which happy-dom does not simulate — so what
  // is asserted here is the thing our code is actually responsible for.
  it("focuses the Continue button so Enter can reach it", async () => {
    const el = await openWidget(DISPLAY_FLOW);
    const btn = shadowQuery<HTMLButtonElement>(el, "button[data-continue]");
    expect(el.shadowRoot?.activeElement).toBe(btn);
  });

  it("does not mark the multiline Continue for autofocus", async () => {
    // A `text` step renders its own Continue, but focusing that one would pull
    // the caret out of the textarea the visitor is meant to be typing into.
    const el = await openWidget(
      singleStepFlow("story", {
        verb: "ask",
        type: "text",
        question: "Describe your business.",
      }),
    );
    expect(shadowQuery(el, ".continue-btn")).not.toBeNull();
    expect(el.shadowRoot?.querySelector("button[data-continue]")).toBeNull();
  });
});

describe("retiring after a completed flow", () => {
  afterEach(() => vi.useRealTimers());

  it("fades the whole widget away once the checkmark has been seen", async () => {
    const el = await openWidget(DISPLAY_FLOW);
    vi.useFakeTimers();

    shadowQuery<HTMLElement>(el, ".continue-btn").click();
    await microflush(el);
    expect(shadowQuery(el, ".complete-text").textContent).toContain(
      "All done!",
    );
    expect(el.classList.contains("iq-dismissing")).toBe(false);

    // The checkmark is meant to be readable before anything moves.
    vi.advanceTimersByTime(3499);
    await microflush(el);
    expect(el.classList.contains("iq-dismissing")).toBe(false);

    vi.advanceTimersByTime(1);
    await microflush(el);
    expect(el.classList.contains("iq-dismissing")).toBe(true);
    // Mid-fade the content is still mounted — the fade is CSS, not a teardown.
    expect(el.shadowRoot?.querySelector(".complete-text")).not.toBeNull();

    vi.advanceTimersByTime(1200);
    await microflush(el);
    expect(el.shadowRoot?.querySelector(".bubble")).toBeNull();
    expect(el.shadowRoot?.querySelector(".panel")).toBeNull();
  });

  it("stays on screen indefinitely when auto-dismiss is switched off", async () => {
    const el = await openWidget(DISPLAY_FLOW, { autoDismissMs: 0 });
    vi.useFakeTimers();

    shadowQuery<HTMLElement>(el, ".continue-btn").click();
    await microflush(el);
    vi.advanceTimersByTime(60_000);
    await microflush(el);

    expect(el.classList.contains("iq-dismissing")).toBe(false);
    expect(shadowQuery(el, ".complete-text")).not.toBeNull();
  });

  it("never retires a summary screen out from under the reader", async () => {
    // That closing screen carries the summary text plus Close and Print.
    // Fading it would destroy the very thing the flow produced.
    const el = await openWidget(SUMMARIZE_FLOW, {
      llmUrl: "https://example.com/llm",
    });
    vi.useFakeTimers();
    await microflush(el);
    vi.advanceTimersByTime(60_000);
    await microflush(el);

    expect(el.classList.contains("iq-dismissing")).toBe(false);
  });
});

describe("numeric bounds from the flow definition", () => {
  const BOUNDED = singleStepFlow("headcount", {
    verb: "ask",
    type: "integer",
    question: "How many employees?",
    min: 1,
    max: 10,
  });

  it("puts the step's min and max onto the rendered field", async () => {
    const el = await openWidget(BOUNDED);
    const field = inner<HTMLInputElement>(el, "iq-number-input", "input");
    expect(field.getAttribute("min")).toBe("1");
    expect(field.getAttribute("max")).toBe("10");
  });

  it("stores the clamped value when the visitor types past the bound", async () => {
    const el = await openWidget(BOUNDED);
    typeInto(inner<HTMLInputElement>(el, "iq-number-input", "input"), "900");
    shadowQuery<HTMLElement>(el, ".submit-btn").click();
    await flush(el);
    expect(bubbles(el)).toContain("10");
  });

  it("leaves an unbounded numeric step without min or max", async () => {
    const el = await openWidget(CURRENCY_FLOW);
    const field = inner<HTMLInputElement>(el, "iq-number-input", "input");
    expect(field.hasAttribute("min")).toBe(false);
    expect(field.hasAttribute("max")).toBe(false);
  });
});
