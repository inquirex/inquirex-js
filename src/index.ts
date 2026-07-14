// Public package entry point.
//
// Importing this module registers the <inquirex-widget> custom element (and its
// sub-components) as a side-effect, and re-exports the programmatic API used by
// advanced consumers. The IIFE build exposes the same surface on the global
// `Inquirex` object; the ESM build exposes it as named exports.

import "./widget.js";

export {
  FlowEngine,
  evaluateRule,
  accumulationContribution,
} from "./engine.js";
export { runExtraction, type ExtractConfig } from "./extract-client.js";
export { applyTheme, contrastColor, darken } from "./theme.js";
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
} from "./types.js";
