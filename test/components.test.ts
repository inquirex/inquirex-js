// @vitest-environment happy-dom
//
// The five input controls. Each one owns a single contract with the widget:
// `getValue()` returns what the engine should store, and `iq-input` /
// `iq-submit` say when the user has changed or committed that value. These
// tests exercise that contract through the DOM rather than by calling methods
// directly, because a control that renders nothing still answers `getValue()`.
import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/components/index.js";
import type { IqBooleanInput } from "../src/components/boolean-input.js";
import type { IqEnumSelect } from "../src/components/enum-select.js";
import type { IqMultiEnum } from "../src/components/multi-enum.js";
import type { IqNumberInput } from "../src/components/number-input.js";
import type { IqTextInput } from "../src/components/text-input.js";
import {
  captureEvents,
  mountElement,
  pressKey,
  settle,
  shadowHtml,
  shadowQuery,
  shadowQueryAll,
  typeInto,
  unmountAll,
} from "./helpers/dom.js";

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

/**
 * The CSS a control ships, read off the registered class.
 *
 * Taken from a mounted instance rather than a direct import so the components
 * stay type-only imports here — the side-effect import above is what registers
 * them, and that is the arrangement the rest of this file relies on.
 */
async function styleTextOf(tag: string): Promise<string> {
  const el = await mountElement(tag);
  return String((el.constructor as { styles?: unknown }).styles);
}

const OPTIONS = [
  { value: "single", label: "Single" },
  { value: "married_jointly", label: "Married Filing Jointly" },
  { value: "hoh", label: "Head of Household" },
];

describe("iq-text-input", () => {
  it("renders a single-line input for a plain string", async () => {
    const el = await mountElement<IqTextInput>("iq-text-input");
    expect(shadowQuery<HTMLInputElement>(el, "input").type).toBe("text");
    expect(el.shadowRoot?.querySelector("textarea")).toBeNull();
  });

  it.each([
    ["email", "email"],
    ["phone", "tel"],
    ["date", "date"],
    ["string", "text"],
  ])("maps type %s to input type %s", async (type, expected) => {
    const el = await mountElement<IqTextInput>("iq-text-input", {
      type: type as IqTextInput["type"],
    });
    expect(shadowQuery<HTMLInputElement>(el, "input").type).toBe(expected);
  });

  it("renders a textarea for the multiline `text` type", async () => {
    const el = await mountElement<IqTextInput>("iq-text-input", {
      type: "text",
    });
    expect(el.shadowRoot?.querySelector("textarea")).not.toBeNull();
    expect(el.shadowRoot?.querySelector("input")).toBeNull();
  });

  it("uses a custom placeholder when given, and a default otherwise", async () => {
    const bare = await mountElement<IqTextInput>("iq-text-input");
    expect(shadowQuery<HTMLInputElement>(bare, "input").placeholder).toBe(
      "Type your answer...",
    );

    const custom = await mountElement<IqTextInput>("iq-text-input", {
      placeholder: "you@example.com",
    });
    expect(shadowQuery<HTMLInputElement>(custom, "input").placeholder).toBe(
      "you@example.com",
    );
  });

  it("trims surrounding whitespace out of getValue", async () => {
    const el = await mountElement<IqTextInput>("iq-text-input");
    typeInto(shadowQuery<HTMLInputElement>(el, "input"), "  Alan Turing  ");
    expect(el.getValue()).toBe("Alan Turing");
  });

  it("returns an empty string before anything is typed", async () => {
    const el = await mountElement<IqTextInput>("iq-text-input");
    expect(el.getValue()).toBe("");
  });

  it("emits iq-input with the raw, untrimmed value on every keystroke", async () => {
    const el = await mountElement<IqTextInput>("iq-text-input");
    const seen = captureEvents(el, "iq-input");
    typeInto(shadowQuery<HTMLInputElement>(el, "input"), "Al ");
    expect(seen).toEqual(["Al "]);
  });

  it("submits on Enter for a single-line field", async () => {
    const el = await mountElement<IqTextInput>("iq-text-input");
    const submits = captureEvents(el, "iq-submit");
    pressKey(shadowQuery(el, "input"), "Enter");
    expect(submits).toHaveLength(1);
  });

  it("does NOT submit on Enter in a textarea — Enter is a newline there", async () => {
    const el = await mountElement<IqTextInput>("iq-text-input", {
      type: "text",
    });
    const submits = captureEvents(el, "iq-submit");
    pressKey(shadowQuery(el, "textarea"), "Enter");
    expect(submits).toHaveLength(0);
  });

  it("ignores keys other than Enter", async () => {
    const el = await mountElement<IqTextInput>("iq-text-input");
    const submits = captureEvents(el, "iq-submit");
    pressKey(shadowQuery(el, "input"), "a");
    pressKey(shadowQuery(el, "input"), "Tab");
    expect(submits).toHaveLength(0);
  });

  it("focuses its field once rendering settles", async () => {
    const el = await mountElement<IqTextInput>("iq-text-input");
    const field = shadowQuery<HTMLInputElement>(el, "input");
    const spy = vi.spyOn(field, "focus");
    el.focus();
    await settle(el);
    await Promise.resolve();
    expect(spy).toHaveBeenCalled();
  });
});

describe("iq-number-input", () => {
  it("shows a $ prefix and the currency attribute for currency", async () => {
    const el = await mountElement<IqNumberInput>("iq-number-input", {
      type: "currency",
    });
    expect(shadowQuery(el, ".prefix").textContent).toBe("$");
    expect(el.hasAttribute("currency")).toBe(true);
  });

  it("shows no prefix for integer or decimal", async () => {
    for (const type of ["integer", "decimal"] as const) {
      const el = await mountElement<IqNumberInput>("iq-number-input", { type });
      expect(el.shadowRoot?.querySelector(".prefix")).toBeNull();
      expect(el.hasAttribute("currency")).toBe(false);
    }
  });

  it("steps by 1 for integers and 0.01 for fractional types", async () => {
    const int = await mountElement<IqNumberInput>("iq-number-input", {
      type: "integer",
    });
    expect(
      shadowQuery<HTMLInputElement>(int, "input").getAttribute("step"),
    ).toBe("1");

    const dec = await mountElement<IqNumberInput>("iq-number-input", {
      type: "decimal",
    });
    expect(
      shadowQuery<HTMLInputElement>(dec, "input").getAttribute("step"),
    ).toBe("0.01");
  });

  it("truncates to an integer for the integer type", async () => {
    const el = await mountElement<IqNumberInput>("iq-number-input", {
      type: "integer",
    });
    typeInto(shadowQuery<HTMLInputElement>(el, "input"), "3.7");
    expect(el.getValue()).toBe(3);
  });

  it("keeps the fraction for decimal and currency", async () => {
    for (const type of ["decimal", "currency"] as const) {
      const el = await mountElement<IqNumberInput>("iq-number-input", { type });
      typeInto(shadowQuery<HTMLInputElement>(el, "input"), "1250.50");
      expect(el.getValue()).toBe(1250.5);
    }
  });

  it("returns null for empty and whitespace-only input", async () => {
    const el = await mountElement<IqNumberInput>("iq-number-input");
    expect(el.getValue()).toBeNull();
    typeInto(shadowQuery<HTMLInputElement>(el, "input"), "   ");
    expect(el.getValue()).toBeNull();
  });

  it("renders a preset value so a step default is visible", async () => {
    const el = await mountElement<IqNumberInput>("iq-number-input", {
      value: 42,
    });
    expect(shadowQuery<HTMLInputElement>(el, "input").value).toBe("42");
  });

  it("defaults the placeholder to 0.00 for currency and 0 otherwise", async () => {
    const money = await mountElement<IqNumberInput>("iq-number-input", {
      type: "currency",
    });
    expect(shadowQuery<HTMLInputElement>(money, "input").placeholder).toBe(
      "0.00",
    );

    const plain = await mountElement<IqNumberInput>("iq-number-input");
    expect(shadowQuery<HTMLInputElement>(plain, "input").placeholder).toBe("0");
  });

  it("emits iq-input with the parsed number", async () => {
    const el = await mountElement<IqNumberInput>("iq-number-input");
    const seen = captureEvents(el, "iq-input");
    typeInto(shadowQuery<HTMLInputElement>(el, "input"), "7");
    expect(seen).toEqual([7]);
  });

  it("submits on Enter", async () => {
    const el = await mountElement<IqNumberInput>("iq-number-input");
    const submits = captureEvents(el, "iq-submit");
    pressKey(shadowQuery(el, "input"), "Enter");
    pressKey(shadowQuery(el, "input"), "Escape");
    expect(submits).toHaveLength(1);
  });

  it("focuses its field once rendering settles", async () => {
    const el = await mountElement<IqNumberInput>("iq-number-input");
    const spy = vi.spyOn(shadowQuery<HTMLInputElement>(el, "input"), "focus");
    el.focus();
    await settle(el);
    await Promise.resolve();
    expect(spy).toHaveBeenCalled();
  });

  // ── Stepper arrows ──
  //
  // The arrows were previously suppressed outright. Asserting on the
  // stylesheet is unusual, but the rendered arrows are drawn by the browser
  // and never appear in the DOM, so the CSS *is* the observable behaviour —
  // and re-adding the suppression is exactly the regression worth catching.
  it("does not suppress the native stepper arrows", async () => {
    const css = await styleTextOf("iq-number-input");
    expect(css).not.toContain("-moz-appearance: textfield");
    expect(css).not.toMatch(/spin-button[\s\S]*?-webkit-appearance:\s*none/);
  });

  it("keeps the arrows visible rather than showing them only on hover", async () => {
    expect(await styleTextOf("iq-number-input")).toMatch(
      /spin-button[\s\S]*?opacity:\s*1/,
    );
  });

  // ── Bounds ──
  it("puts min and max on the field when the step declares them", async () => {
    const el = await mountElement<IqNumberInput>("iq-number-input", {
      type: "integer",
      min: 1,
      max: 10,
    });
    const field = shadowQuery<HTMLInputElement>(el, "input");
    expect(field.getAttribute("min")).toBe("1");
    expect(field.getAttribute("max")).toBe("10");
  });

  it("leaves min and max off entirely when unbounded", async () => {
    const el = await mountElement<IqNumberInput>("iq-number-input");
    const field = shadowQuery<HTMLInputElement>(el, "input");
    expect(field.hasAttribute("min")).toBe(false);
    expect(field.hasAttribute("max")).toBe(false);
  });

  it("prefers an explicit step over the per-type default", async () => {
    const el = await mountElement<IqNumberInput>("iq-number-input", {
      type: "integer",
      step: 5,
    });
    expect(
      shadowQuery<HTMLInputElement>(el, "input").getAttribute("step"),
    ).toBe("5");
  });

  // A browser will not stop someone typing or pasting past min/max — the
  // attributes only bound the arrows and flip :out-of-range. getValue is the
  // one place the bound can actually be enforced, so it is tested directly.
  it("clamps a typed value above max down to max", async () => {
    const el = await mountElement<IqNumberInput>("iq-number-input", {
      type: "integer",
      min: 1,
      max: 10,
    });
    typeInto(shadowQuery<HTMLInputElement>(el, "input"), "900");
    expect(el.getValue()).toBe(10);
  });

  it("clamps a typed value below min up to min", async () => {
    const el = await mountElement<IqNumberInput>("iq-number-input", {
      type: "integer",
      min: 1,
      max: 10,
    });
    typeInto(shadowQuery<HTMLInputElement>(el, "input"), "-40");
    expect(el.getValue()).toBe(1);
  });

  it("passes an in-range value through untouched", async () => {
    const el = await mountElement<IqNumberInput>("iq-number-input", {
      type: "integer",
      min: 1,
      max: 10,
    });
    typeInto(shadowQuery<HTMLInputElement>(el, "input"), "7");
    expect(el.getValue()).toBe(7);
  });

  it("clamps against a lone bound, leaving the open end alone", async () => {
    const floored = await mountElement<IqNumberInput>("iq-number-input", {
      type: "integer",
      min: 0,
    });
    typeInto(shadowQuery<HTMLInputElement>(floored, "input"), "-5");
    expect(floored.getValue()).toBe(0);
    typeInto(shadowQuery<HTMLInputElement>(floored, "input"), "99999");
    expect(floored.getValue()).toBe(99999);
  });

  it("rewrites the field on commit so the stored value is the visible one", async () => {
    const el = await mountElement<IqNumberInput>("iq-number-input", {
      type: "integer",
      min: 1,
      max: 10,
    });
    const field = shadowQuery<HTMLInputElement>(el, "input");
    typeInto(field, "900");
    field.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(el);
    expect(field.value).toBe("10");
  });

  it("warns while out of range and stops once the value is back inside", async () => {
    const el = await mountElement<IqNumberInput>("iq-number-input", {
      type: "integer",
      min: 1,
      max: 10,
    });
    const field = shadowQuery<HTMLInputElement>(el, "input");

    typeInto(field, "900");
    await settle(el);
    expect(shadowQuery(el, ".range-hint").textContent).toContain(
      "between 1 and 10",
    );

    typeInto(field, "4");
    await settle(el);
    expect(el.shadowRoot?.querySelector(".range-hint")).toBeNull();
  });

  it("does not warn on a half-typed number that is merely incomplete", async () => {
    // Typing "15" into a 10–20 field passes through "1". Warning there — or
    // worse, snapping to 10 — would make the field impossible to fill.
    const el = await mountElement<IqNumberInput>("iq-number-input", {
      type: "integer",
      min: 10,
      max: 20,
    });
    typeInto(shadowQuery<HTMLInputElement>(el, "input"), "1");
    await settle(el);
    expect(shadowQuery<HTMLInputElement>(el, "input").value).toBe("1");
  });
});

describe("iq-enum-select", () => {
  it("renders one radio row per option, labelled", async () => {
    const el = await mountElement<IqEnumSelect>("iq-enum-select", {
      options: OPTIONS,
    });
    const rows = shadowQueryAll(el, ".option");
    expect(rows).toHaveLength(3);
    expect(shadowHtml(el)).toContain("Married Filing Jointly");
    expect(shadowQuery(el, ".options").getAttribute("role")).toBe("radiogroup");
  });

  it("renders nothing but an empty group when there are no options", async () => {
    const el = await mountElement<IqEnumSelect>("iq-enum-select");
    expect(shadowQueryAll(el, ".option")).toHaveLength(0);
  });

  it("starts with no selection", async () => {
    const el = await mountElement<IqEnumSelect>("iq-enum-select", {
      options: OPTIONS,
    });
    expect(el.getValue()).toBeNull();
  });

  it("stores the option's form value, not its label", async () => {
    const el = await mountElement<IqEnumSelect>("iq-enum-select", {
      options: OPTIONS,
    });
    shadowQueryAll<HTMLElement>(el, ".option")[1].click();
    await settle(el);
    expect(el.getValue()).toBe("married_jointly");
  });

  it("marks the chosen row selected and checked, and only that row", async () => {
    const el = await mountElement<IqEnumSelect>("iq-enum-select", {
      options: OPTIONS,
    });
    shadowQueryAll<HTMLElement>(el, ".option")[2].click();
    await settle(el);

    const rows = shadowQueryAll(el, ".option");
    expect(rows[2].hasAttribute("data-selected")).toBe(true);
    expect(rows[2].getAttribute("aria-checked")).toBe("true");
    expect(rows[0].hasAttribute("data-selected")).toBe(false);
    expect(rows[0].getAttribute("aria-checked")).toBe("false");
  });

  it("replaces the previous choice rather than accumulating", async () => {
    const el = await mountElement<IqEnumSelect>("iq-enum-select", {
      options: OPTIONS,
    });
    const rows = shadowQueryAll<HTMLElement>(el, ".option");
    rows[0].click();
    await settle(el);
    rows[1].click();
    await settle(el);

    expect(el.getValue()).toBe("married_jointly");
    expect(shadowQueryAll(el, "[data-selected]")).toHaveLength(1);
  });

  it("emits iq-input at once, then auto-submits after the confirmation beat", async () => {
    vi.useFakeTimers();
    const el = await mountElement<IqEnumSelect>("iq-enum-select", {
      options: OPTIONS,
    });
    const inputs = captureEvents(el, "iq-input");
    const submits = captureEvents(el, "iq-submit");

    shadowQueryAll<HTMLElement>(el, ".option")[0].click();
    expect(inputs).toEqual(["single"]);
    // The pause is what lets the user see their choice highlight before the
    // question is replaced; submitting synchronously would look like a glitch.
    expect(submits).toHaveLength(0);

    vi.advanceTimersByTime(200);
    expect(submits).toHaveLength(1);
  });
});

describe("iq-multi-enum", () => {
  it("renders one checkbox row per option", async () => {
    const el = await mountElement<IqMultiEnum>("iq-multi-enum", {
      options: OPTIONS,
    });
    expect(shadowQueryAll(el, ".option")).toHaveLength(3);
    expect(shadowQuery(el, ".options").getAttribute("role")).toBe("group");
  });

  it("starts empty and accumulates selections", async () => {
    const el = await mountElement<IqMultiEnum>("iq-multi-enum", {
      options: OPTIONS,
    });
    expect(el.getValue()).toEqual([]);

    const rows = shadowQueryAll<HTMLElement>(el, ".option");
    rows[0].click();
    await settle(el);
    rows[2].click();
    await settle(el);

    expect(el.getValue()).toEqual(["single", "hoh"]);
  });

  it("toggles a selected option back off", async () => {
    const el = await mountElement<IqMultiEnum>("iq-multi-enum", {
      options: OPTIONS,
    });
    const row = shadowQueryAll<HTMLElement>(el, ".option")[1];
    row.click();
    await settle(el);
    expect(el.getValue()).toEqual(["married_jointly"]);

    row.click();
    await settle(el);
    expect(el.getValue()).toEqual([]);
    expect(shadowQueryAll(el, "[data-selected]")).toHaveLength(0);
  });

  it("pre-checks LLM suggestions passed as `initial`", async () => {
    const el = await mountElement<IqMultiEnum>("iq-multi-enum", {
      options: OPTIONS,
      initial: ["single", "hoh"],
    });
    expect(el.getValue()).toEqual(["single", "hoh"]);
    expect(shadowQueryAll(el, "[data-selected]")).toHaveLength(2);
  });

  it("lets the user remove a suggestion — a prefill is a hint, not a fact", async () => {
    const el = await mountElement<IqMultiEnum>("iq-multi-enum", {
      options: OPTIONS,
      initial: ["single"],
    });
    shadowQueryAll<HTMLElement>(el, ".option")[0].click();
    await settle(el);
    expect(el.getValue()).toEqual([]);
  });

  it("does not let a later `initial` overwrite what the user already picked", async () => {
    const el = await mountElement<IqMultiEnum>("iq-multi-enum", {
      options: OPTIONS,
    });
    shadowQueryAll<HTMLElement>(el, ".option")[1].click();
    await settle(el);

    el.initial = ["single", "hoh"];
    await settle(el);

    expect(el.getValue()).toEqual(["married_jointly"]);
  });

  it("emits iq-input with the full selection each time, and never auto-submits", async () => {
    vi.useFakeTimers();
    const el = await mountElement<IqMultiEnum>("iq-multi-enum", {
      options: OPTIONS,
    });
    const inputs = captureEvents(el, "iq-input");
    const submits = captureEvents(el, "iq-submit");

    const rows = shadowQueryAll<HTMLElement>(el, ".option");
    rows[0].click();
    rows[1].click();

    expect(inputs).toEqual([["single"], ["single", "married_jointly"]]);

    // A multi-select cannot know when the user is done, so it waits for the
    // widget's own Continue button.
    vi.advanceTimersByTime(1000);
    expect(submits).toHaveLength(0);
  });
});

describe("iq-boolean-input", () => {
  it("renders Yes and No", async () => {
    const el = await mountElement<IqBooleanInput>("iq-boolean-input");
    const buttons = shadowQueryAll(el, "button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Yes", "No"]);
  });

  it("starts with no answer, so an unanswered confirm is not a silent No", async () => {
    const el = await mountElement<IqBooleanInput>("iq-boolean-input");
    expect(el.getValue()).toBeNull();
  });

  it.each([
    [0, true],
    [1, false],
  ])("button %i yields %s", async (index, expected) => {
    const el = await mountElement<IqBooleanInput>("iq-boolean-input");
    shadowQueryAll<HTMLElement>(el, "button")[index].click();
    await settle(el);
    expect(el.getValue()).toBe(expected);
    expect(
      shadowQueryAll(el, "button")[index].hasAttribute("data-selected"),
    ).toBe(true);
  });

  it("lets the user change their mind before the submit fires", async () => {
    vi.useFakeTimers();
    const el = await mountElement<IqBooleanInput>("iq-boolean-input");
    const buttons = shadowQueryAll<HTMLElement>(el, "button");
    buttons[0].click();
    buttons[1].click();
    await settle(el);
    expect(el.getValue()).toBe(false);
  });

  it("emits iq-input at once, then auto-submits after the confirmation beat", async () => {
    vi.useFakeTimers();
    const el = await mountElement<IqBooleanInput>("iq-boolean-input");
    const inputs = captureEvents(el, "iq-input");
    const submits = captureEvents(el, "iq-submit");

    shadowQueryAll<HTMLElement>(el, "button")[0].click();
    expect(inputs).toEqual([true]);
    expect(submits).toHaveLength(0);

    vi.advanceTimersByTime(200);
    expect(submits).toHaveLength(1);
  });
});
