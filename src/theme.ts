import type { FlowDefinition, ThemeOverrides } from "./types.js";

/** Map named theme keys to their CSS custom properties. Exported so hosts (and
 *  the docs) can introspect the full set of knobs. */
export const THEME_VAR_MAP: Record<string, string> = {
  brand: "--iq-brand",
  onBrand: "--iq-on-brand",
  background: "--iq-bg",
  surface: "--iq-surface",
  text: "--iq-text",
  textMuted: "--iq-text-muted",
  border: "--iq-border",
  headerBg: "--iq-header-bg",
  headerText: "--iq-header-text",
  headerFontSize: "--iq-header-font-size",
  highlight: "--iq-highlight",
  bubbleQuestionBg: "--iq-bubble-q-bg",
  bubbleQuestionText: "--iq-bubble-q-text",
  bubbleAnswerBg: "--iq-bubble-a-bg",
  bubbleAnswerText: "--iq-bubble-a-text",
  launcherBg: "--iq-launcher-bg",
  launcherIcon: "--iq-launcher-icon",
  launcherSize: "--iq-launcher-size",
  launcherRadius: "--iq-launcher-radius",
  panelWidth: "--iq-panel-width",
  panelMaxHeight: "--iq-panel-max-height",
  offsetBlock: "--iq-offset-block",
  offsetInline: "--iq-offset-inline",
  radius: "--iq-radius",
  padding: "--iq-pad",
  font: "--iq-font",
  fontSize: "--iq-font-size",
  headerFont: "--iq-header-font",
};

/** A raw escape-hatch key: any `--iq-`-prefixed custom property. Restricted to
 *  a conservative character set so a stray key can't smuggle odd syntax. */
const RAW_VAR = /^--iq-[a-z0-9-]+$/i;

/** Default font stack we append to user-provided font values, so that
 *  unavailable user fonts gracefully fall back to our Outfit + system stack
 *  rather than the browser's generic sans-serif. */
const FONT_FALLBACK = "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif";

/**
 * Compute a contrasting text color (black or white) for a given background.
 * Uses the YIQ perceived-brightness formula. Falls back to white on parse failure.
 */
export function contrastColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#ffffff";
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness > 150 ? "#1c1917" : "#ffffff";
}

/** Darken a color by a given percentage (0..1). */
export function darken(hex: string, amount = 0.15): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = Math.max(0, Math.round(rgb.r * (1 - amount)));
  const g = Math.max(0, Math.round(rgb.g * (1 - amount)));
  const b = Math.max(0, Math.round(rgb.b * (1 - amount)));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f0-9]{3}|[a-f0-9]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Apply a set of theme overrides to an element's inline style, populating the
 * widget's CSS custom properties. Auto-computes onBrand and a darker brand
 * shade when brand is set without them.
 *
 * Both the flow's `meta.theme` and the embedder's config `theme` funnel through
 * here. Because these land as *inline* styles, they win over any host-page
 * stylesheet rule targeting the element — which is the documented precedence:
 * built-in defaults < host CSS < explicit theme.
 *
 * Two kinds of key are accepted:
 *   - a named key from {@link THEME_VAR_MAP} (`headerBg`, `launcherRadius`, …);
 *   - a raw `--iq-*` custom property, set verbatim — the escape hatch for any
 *     variable that has no named key yet.
 * Unknown keys are ignored rather than throwing.
 */
export function applyThemeOverrides(
  el: HTMLElement,
  theme: ThemeOverrides | undefined,
): void {
  if (!theme) return;

  const brand = sanitize(theme.brand);
  if (brand) {
    el.style.setProperty("--iq-brand", brand);
    el.style.setProperty("--iq-brand-dark", darken(brand, 0.15));
    if (!theme.onBrand) {
      el.style.setProperty("--iq-on-brand", contrastColor(brand));
    }
  }

  for (const [key, raw] of Object.entries(theme)) {
    const value = sanitize(raw);
    if (!value) continue;
    // A raw `--iq-*` key passes straight through; otherwise map the named key.
    const cssVar = key.startsWith("--iq-")
      ? RAW_VAR.test(key)
        ? key
        : ""
      : THEME_VAR_MAP[key];
    if (!cssVar) continue;
    // For font stacks, append the widget's fallback so unavailable user
    // fonts degrade to Outfit / system fonts rather than generic sans-serif.
    const final =
      key === "font" || key === "headerFont"
        ? `${value}, ${FONT_FALLBACK}`
        : value;
    el.style.setProperty(cssVar, final);
  }
}

/**
 * Apply a flow definition's `meta.theme` to an element. Thin wrapper over
 * {@link applyThemeOverrides} kept for the flow-load call site.
 */
export function applyTheme(el: HTMLElement, def: FlowDefinition): void {
  applyThemeOverrides(el, def.meta?.theme);
}

/** Trim whitespace and strip stray trailing semicolons — a common paste-error. */
function sanitize(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\s;]+$/, "").trim();
}
