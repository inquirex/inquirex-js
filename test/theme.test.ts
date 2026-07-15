import { describe, it, expect, beforeEach } from "vitest";
import {
  contrastColor,
  darken,
  applyTheme,
  applyThemeOverrides,
} from "../src/theme.js";
import type { FlowDefinition } from "../src/types.js";

describe("contrastColor", () => {
  it("returns dark text on white", () => {
    expect(contrastColor("#ffffff")).toBe("#1c1917");
  });

  it("returns white text on black", () => {
    expect(contrastColor("#000000")).toBe("#ffffff");
  });

  it("returns white text on medium-dark brand blue", () => {
    expect(contrastColor("#2563eb")).toBe("#ffffff");
  });

  it("returns dark text on pale yellow", () => {
    expect(contrastColor("#fef3c7")).toBe("#1c1917");
  });

  it("returns white text on saturated amber (still light enough that eye wants dark)", () => {
    // amber #f59e0b has brightness ~166 — above threshold, picks dark text
    expect(contrastColor("#f59e0b")).toBe("#1c1917");
  });

  it("handles 3-digit hex", () => {
    expect(contrastColor("#fff")).toBe("#1c1917");
    expect(contrastColor("#000")).toBe("#ffffff");
  });

  it("handles hex without leading #", () => {
    expect(contrastColor("ffffff")).toBe("#1c1917");
  });

  it("falls back to white on malformed input", () => {
    expect(contrastColor("not a color")).toBe("#ffffff");
    expect(contrastColor("")).toBe("#ffffff");
  });
});

describe("darken", () => {
  it("darkens by the given fraction", () => {
    expect(darken("#808080", 0.5)).toBe("#404040");
  });

  it("never produces a negative channel value", () => {
    expect(darken("#000000", 0.5)).toBe("#000000");
  });

  it("returns the original on malformed input", () => {
    expect(darken("bogus", 0.3)).toBe("bogus");
  });

  it("defaults to a 15% darken", () => {
    // #ff0000 × 0.85 = 216.75 → 217 → 0xd9
    expect(darken("#ff0000")).toBe("#d90000");
  });
});

describe("applyTheme", () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = {
      style: {
        _map: new Map<string, string>(),
        setProperty(k: string, v: string) {
          (this as any)._map.set(k, v);
        },
        getPropertyValue(k: string) {
          return (this as any)._map.get(k) ?? "";
        },
      },
    } as unknown as HTMLElement;
  });

  const def = (meta: FlowDefinition["meta"]): FlowDefinition => ({
    id: "t",
    version: "1.0.0",
    start: "a",
    steps: { a: { verb: "say", text: "hi" } },
    meta,
  });

  it("no-ops when meta is absent", () => {
    applyTheme(el, def(undefined));
    expect(el.style.getPropertyValue("--iq-brand")).toBe("");
  });

  it("no-ops when theme is absent (brand is metadata-only)", () => {
    applyTheme(el, def({ brand: { name: "Acme" } }));
    expect(el.style.getPropertyValue("--iq-brand")).toBe("");
  });

  it("sets --iq-brand from theme.brand", () => {
    applyTheme(el, def({ theme: { brand: "#f59e0b" } }));
    expect(el.style.getPropertyValue("--iq-brand")).toBe("#f59e0b");
  });

  it("computes --iq-on-brand automatically when not overridden", () => {
    applyTheme(el, def({ theme: { brand: "#2563eb" } }));
    expect(el.style.getPropertyValue("--iq-on-brand")).toBe("#ffffff");
  });

  it("respects explicit onBrand over auto-contrast", () => {
    applyTheme(el, def({ theme: { brand: "#2563eb", onBrand: "#ff00ff" } }));
    expect(el.style.getPropertyValue("--iq-on-brand")).toBe("#ff00ff");
  });

  it("maps every theme key to its CSS variable", () => {
    applyTheme(
      el,
      def({
        theme: {
          background: "#111",
          surface: "#222",
          text: "#fff",
          textMuted: "#aaa",
          border: "#444",
          radius: "8px",
        },
      }),
    );
    expect(el.style.getPropertyValue("--iq-bg")).toBe("#111");
    expect(el.style.getPropertyValue("--iq-surface")).toBe("#222");
    expect(el.style.getPropertyValue("--iq-text")).toBe("#fff");
    expect(el.style.getPropertyValue("--iq-text-muted")).toBe("#aaa");
    expect(el.style.getPropertyValue("--iq-border")).toBe("#444");
    expect(el.style.getPropertyValue("--iq-radius")).toBe("8px");
  });

  it("appends widget font fallback to user font stacks", () => {
    applyTheme(el, def({ theme: { font: "'Cairo', sans-serif" } }));
    // User font first, then our Outfit fallback stack
    expect(el.style.getPropertyValue("--iq-font")).toBe(
      "'Cairo', sans-serif, 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
    );
  });

  it("appends widget font fallback to headerFont too", () => {
    applyTheme(el, def({ theme: { headerFont: "'Bebas Neue'" } }));
    expect(el.style.getPropertyValue("--iq-header-font")).toBe(
      "'Bebas Neue', 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
    );
  });

  it("sets --iq-brand-dark to a darker shade", () => {
    applyTheme(el, def({ theme: { brand: "#ff0000" } }));
    expect(el.style.getPropertyValue("--iq-brand-dark")).toBe("#d90000");
  });

  it("auto-contrast fixes the white-brand bug — picks dark text on white", () => {
    applyTheme(el, def({ theme: { brand: "#ffffff" } }));
    expect(el.style.getPropertyValue("--iq-on-brand")).toBe("#1c1917");
  });

  it("ignores empty-string theme values", () => {
    applyTheme(el, def({ theme: { font: "" } }));
    expect(el.style.getPropertyValue("--iq-font")).toBe("");
  });

  it("strips trailing semicolons from values (common paste-error)", () => {
    applyTheme(el, def({ theme: { radius: "20px;" } }));
    expect(el.style.getPropertyValue("--iq-radius")).toBe("20px");
  });

  it("strips multiple trailing semicolons and whitespace", () => {
    applyTheme(el, def({ theme: { radius: "  12px  ;;  " } }));
    expect(el.style.getPropertyValue("--iq-radius")).toBe("12px");
  });

  it("maps the launcher, panel, offset, and font-size knobs", () => {
    applyTheme(
      el,
      def({
        theme: {
          launcherSize: "72px",
          launcherRadius: "12px",
          panelWidth: "480px",
          panelMaxHeight: "700px",
          offsetBlock: "8px",
          offsetInline: "40px",
          fontSize: "16px",
        },
      }),
    );
    expect(el.style.getPropertyValue("--iq-launcher-size")).toBe("72px");
    expect(el.style.getPropertyValue("--iq-launcher-radius")).toBe("12px");
    expect(el.style.getPropertyValue("--iq-panel-width")).toBe("480px");
    expect(el.style.getPropertyValue("--iq-panel-max-height")).toBe("700px");
    expect(el.style.getPropertyValue("--iq-offset-block")).toBe("8px");
    expect(el.style.getPropertyValue("--iq-offset-inline")).toBe("40px");
    expect(el.style.getPropertyValue("--iq-font-size")).toBe("16px");
  });
});

describe("applyThemeOverrides — raw --iq-* escape hatch", () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = {
      style: {
        _map: new Map<string, string>(),
        setProperty(k: string, v: string) {
          (this as any)._map.set(k, v);
        },
        getPropertyValue(k: string) {
          return (this as any)._map.get(k) ?? "";
        },
      },
    } as unknown as HTMLElement;
  });

  it("passes a raw --iq-* property straight through", () => {
    applyThemeOverrides(el, { "--iq-brand-dark": "#123456" });
    expect(el.style.getPropertyValue("--iq-brand-dark")).toBe("#123456");
  });

  it("reaches a variable that has no named key", () => {
    applyThemeOverrides(el, { "--iq-panel-max-height": "90dvh" });
    expect(el.style.getPropertyValue("--iq-panel-max-height")).toBe("90dvh");
  });

  it("mixes raw and named keys", () => {
    applyThemeOverrides(el, {
      headerBg: "#111",
      "--iq-launcher-size": "80px",
    });
    expect(el.style.getPropertyValue("--iq-header-bg")).toBe("#111");
    expect(el.style.getPropertyValue("--iq-launcher-size")).toBe("80px");
  });

  it("ignores custom properties outside the --iq- namespace", () => {
    applyThemeOverrides(el, { "--evil-thing": "red" } as never);
    expect(el.style.getPropertyValue("--evil-thing")).toBe("");
  });

  it("ignores a malformed --iq- key rather than setting it", () => {
    applyThemeOverrides(el, { "--iq-bad key;x": "red" } as never);
    expect(el.style.getPropertyValue("--iq-bad key;x")).toBe("");
  });

  it("ignores unknown named keys", () => {
    applyThemeOverrides(el, { notAThing: "red" } as never);
    expect(el.style.getPropertyValue("notAThing")).toBe("");
  });
});
