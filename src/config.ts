// Configuration resolution.
//
// One shape (`InquirexConfig`) is fed from four possible places; this module
// merges them by precedence and normalizes the result. Keeping every source in
// one place means the `<script>` drop-in, the `import`/`mount()` path, and the
// baked qualified.at per-form bundle all behave identically.

import type {
  InquirexConfig,
  TriggerMode,
  WidgetPosition,
} from "./types.js";

/** Build-time baked config, injected by Vite `define` for the per-form bundle.
 *  Defaults to `null` in normal builds (see vite.config.ts). */
declare const __INQUIREX_BAKED_CONFIG__: InquirexConfig | null;

declare global {
  interface Window {
    /** Set before the widget script to configure it without a build step. */
    InquirexConfig?: InquirexConfig;
  }
}

const DEFAULT_QUALIFIED_ORIGIN = "https://qualified.at";

/** Resolve the effective config from all sources, highest precedence first:
 *  1. `override`  — an explicit {@link mount} argument
 *  2. `script`    — `data-inquirex-*` attributes on the loading <script>
 *  3. `window.InquirexConfig`
 *  4. `__INQUIREX_BAKED_CONFIG__` — compiled into the per-form bundle
 *  Later sources only fill fields still `undefined`. */
export function resolveConfig(
  script?: HTMLScriptElement | null,
  override?: InquirexConfig,
): InquirexConfig {
  const baked =
    typeof __INQUIREX_BAKED_CONFIG__ !== "undefined"
      ? __INQUIREX_BAKED_CONFIG__
      : null;

  const merged = mergeConfigs(
    override,
    script ? readScriptConfig(script) : undefined,
    typeof window !== "undefined" ? window.InquirexConfig : undefined,
    baked ?? undefined,
  );

  return normalize(merged);
}

/** Shallow-merge configs by precedence (earliest wins), with a deep merge for
 *  the nested `theme` object so a later source can supply theme keys an earlier
 *  one omitted. */
export function mergeConfigs(
  ...sources: Array<InquirexConfig | undefined>
): InquirexConfig {
  const out: InquirexConfig = {};
  const themes: Array<Record<string, unknown>> = [];

  // Apply highest precedence first; only fill unset keys thereafter.
  for (const src of sources) {
    if (!src) continue;
    for (const [key, value] of Object.entries(src)) {
      if (value === undefined || value === "") continue;
      if (key === "theme") {
        themes.push(value as Record<string, unknown>);
        continue;
      }
      if ((out as Record<string, unknown>)[key] === undefined) {
        (out as Record<string, unknown>)[key] = value;
      }
    }
  }

  // Merge themes with the same earliest-wins rule.
  if (themes.length) {
    const theme: Record<string, unknown> = {};
    for (const t of themes) {
      for (const [k, v] of Object.entries(t)) {
        if (v === undefined || v === "") continue;
        if (theme[k] === undefined) theme[k] = v;
      }
    }
    out.theme = theme;
  }

  return out;
}

/** Read `data-inquirex-*` attributes off the loading <script> tag. */
export function readScriptConfig(script: HTMLScriptElement): InquirexConfig {
  const attr = (name: string) =>
    script.getAttribute(`data-inquirex-${name}`) ?? undefined;

  const cfg: InquirexConfig = {
    url: attr("url"),
    json: attr("json"),
    siteId: attr("site-id"),
    submitUrl: attr("submit-to"),
    llmUrl: attr("llm-url"),
    auth: attr("auth"),
  };

  const origins = attr("origins");
  if (origins !== undefined) {
    cfg.origins = origins
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }

  const timeout = attr("llm-timeout");
  if (timeout !== undefined) cfg.llmTimeout = Number(timeout);

  const trigger = attr("trigger");
  if (trigger !== undefined) cfg.trigger = trigger as TriggerMode;

  const triggerDelay = attr("trigger-delay");
  if (triggerDelay !== undefined) cfg.triggerDelay = Number(triggerDelay);

  const position = attr("position");
  if (position !== undefined) cfg.position = position as WidgetPosition;

  // `data-inquirex-theme` carries a JSON object of theme overrides. A malformed
  // value is ignored rather than breaking the whole embed.
  const theme = attr("theme");
  if (theme !== undefined) {
    try {
      cfg.theme = JSON.parse(theme);
    } catch {
      // ignore invalid theme JSON
    }
  }

  return cfg;
}

/** Fill defaults and derive fields (site-id → url, submit fallback). */
function normalize(cfg: InquirexConfig): InquirexConfig {
  const out: InquirexConfig = { ...cfg };

  // Derive the flow URL from a qualified.at site id when no explicit url given.
  if (!out.url && out.siteId) {
    out.url = `${DEFAULT_QUALIFIED_ORIGIN}/api/flows/${out.siteId}`;
  }

  // Answers POST back to the flow URL unless a distinct target is set.
  if (!out.submitUrl && out.url) out.submitUrl = out.url;

  out.trigger ??= "click";
  out.triggerDelay ??= 1000;
  out.position ??= "bottom-right";
  out.llmTimeout ??= 20000;

  return out;
}

/** True when the config has enough to actually render a flow. */
export function hasFlowSource(cfg: InquirexConfig): boolean {
  return !!(cfg.url || cfg.json || cfg.siteId);
}
