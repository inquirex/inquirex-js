// Public package entry point.
//
// Importing this module registers the <inquirex-widget> custom element (and its
// sub-components) as a side-effect, and re-exports the programmatic API used by
// advanced consumers. The IIFE build exposes the same surface on the global
// `Inquirex` object; the ESM build exposes it as named exports.
//
// Two ways to embed:
//   1. <script src> drop-in — reads `data-inquirex-*` off its own tag and
//      auto-mounts (see `autoMount` below).
//   2. `import { mount } from "inquirex-js"` — call `mount(config)` yourself.
// Both funnel through the same `resolveConfig` precedence.

import "./widget.js";
import type { InquirexWidget } from "./widget.js";
import { resolveConfig, hasFlowSource } from "./config.js";
import type { InquirexConfig } from "./types.js";

// Capture the loading <script> synchronously. `document.currentScript` is only
// valid during a classic script's initial execution (the IIFE build); it is
// null for ES modules and after any await, so we must read it at eval time.
const CURRENT_SCRIPT: HTMLScriptElement | null =
  typeof document !== "undefined"
    ? (document.currentScript as HTMLScriptElement | null)
    : null;

/** Create and configure an `<inquirex-widget>` from a fully-resolved config —
 *  without attaching it. Exposed so hosts can place it in a specific container. */
export function createWidget(config: InquirexConfig): InquirexWidget {
  const el = document.createElement("inquirex-widget") as InquirexWidget;
  el.url = config.url ?? "";
  el.flowJson =
    typeof config.json === "string"
      ? config.json
      : config.json
        ? JSON.stringify(config.json)
        : "";
  el.submitUrl = config.submitUrl ?? "";
  el.llmUrl = config.llmUrl ?? "";
  el.llmTimeout = config.llmTimeout ?? 20000;
  el.auth = config.auth ?? "";
  el.trigger = config.trigger ?? "click";
  el.triggerDelay = config.triggerDelay ?? 1000;
  el.position = config.position ?? "bottom-right";
  el.themeOverrides = config.theme;
  return el;
}

/** Mount the widget onto the page. Merges the given config with any
 *  `window.InquirexConfig` and build-time baked config, then appends the
 *  element to `target` (defaults to `document.body`). */
export function mount(
  config: InquirexConfig = {},
  target: HTMLElement = document.body,
): InquirexWidget {
  const el = createWidget(resolveConfig(null, config));
  target.appendChild(el);
  return el;
}

/** Auto-mount from the loading `<script>`'s `data-inquirex-*` attributes.
 *  A no-op unless a flow source (url / json / site-id) is configured, so an
 *  ESM `import` never spawns an unwanted widget. */
function autoMount(): void {
  const cfg = resolveConfig(CURRENT_SCRIPT);
  if (!hasFlowSource(cfg)) return;
  document.body.appendChild(createWidget(cfg));
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoMount);
  } else {
    autoMount();
  }
}

export { FlowEngine, evaluateRule, accumulationContribution } from "./engine.js";
export { runServerVerb, type ServerVerbConfig } from "./server-verb.js";
export {
  applyTheme,
  applyThemeOverrides,
  contrastColor,
  darken,
} from "./theme.js";
export {
  resolveConfig,
  mergeConfigs,
  readScriptConfig,
  hasFlowSource,
} from "./config.js";
export { InquirexWidget } from "./widget.js";

export type {
  DataType,
  Verb,
  Option,
  RuleDefinition,
  TransitionDefinition,
  WidgetHint,
  AccumulationShape,
  AccumulatorDeclaration,
  StepDefinition,
  ThemeOverrides,
  FlowDefinition,
  Totals,
  Answers,
  HistoryEntry,
  ExtractResponse,
  InquirexConfig,
  TriggerMode,
  WidgetPosition,
} from "./types.js";
