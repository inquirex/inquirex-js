/** Data types supported by Inquirex steps. */
export type DataType =
  | "string"
  | "text"
  | "integer"
  | "decimal"
  | "currency"
  | "boolean"
  | "enum"
  | "multi_enum"
  | "date"
  | "email"
  | "phone";

/** Display verbs produce no user input; collecting verbs do. */
export type Verb = "ask" | "confirm" | "say" | "header" | "btw" | "warning";

/** A single option in an enum / multi_enum step. */
export interface Option {
  value: string;
  label: string;
}

/** Serialized rule — immutable AST node matching the Ruby rule system. */
export type RuleDefinition =
  | { op: "contains"; field: string; value: unknown }
  | { op: "equals"; field: string; value: unknown }
  | { op: "greater_than"; field: string; value: number }
  | { op: "less_than"; field: string; value: number }
  | { op: "not_empty"; field: string }
  | { op: "all"; rules: RuleDefinition[] }
  | { op: "any"; rules: RuleDefinition[] };

/** A single transition edge between steps. */
export interface TransitionDefinition {
  to: string;
  rule?: RuleDefinition;
  requires_server?: boolean;
}

/** Per-target widget hint from inquirex-ui. */
export interface WidgetHint {
  type: string;
  [key: string]: unknown;
}

/** One step in the flow graph. */
export interface StepDefinition {
  verb: Verb;
  type?: DataType;
  question?: string;
  text?: string;
  options?: Option[];
  default?: unknown;
  skip_if?: RuleDefinition;
  transitions?: TransitionDefinition[];
  widget?: Record<string, WidgetHint>;
  requires_server?: boolean;
}

/** Top-level flow definition — the JSON wire format contract. */
export interface FlowDefinition {
  id: string;
  version: string;
  meta?: {
    title?: string;
    subtitle?: string;
    brand?: { name?: string; color?: string };
  };
  start: string;
  steps: Record<string, StepDefinition>;
}

/** Collected answers keyed by step id. */
export type Answers = Record<string, unknown>;

/** A completed Q&A entry in the conversation history. */
export interface HistoryEntry {
  stepId: string;
  step: StepDefinition;
  answer?: unknown;
}
