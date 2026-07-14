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

/** Display verbs produce no user input; collecting verbs do.
 *  `extract` (alias `clarify`) is a server-processing verb: it collects no
 *  input directly — the widget round-trips to the server, which returns
 *  structured answers that pre-fill (and thereby skip) later steps. */
export type Verb =
  | "ask"
  | "confirm"
  | "say"
  | "header"
  | "btw"
  | "warning"
  | "extract"
  | "clarify";

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

/** A single per-step contribution declaration. Exactly one shape key is set. */
export type AccumulationShape =
  | { lookup: Record<string, number> }
  | { per_selection: Record<string, number> }
  | { per_unit: number }
  | { flat: number };

/** Flow-level accumulator declaration (e.g. :price, :complexity, :credit_score). */
export interface AccumulatorDeclaration {
  type: string;
  default: number;
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
  /** Spinner label shown while an `extract` step round-trips to the server.
   *  The only piece of the server-side `llm` block the client ever sees. */
  thinking_label?: string;
  /** Map of accumulator name -> contribution shape. */
  accumulate?: Record<string, AccumulationShape>;
}

/** Visual theme overrides. Each field maps 1:1 to a CSS custom property
 *  on the widget's shadow root. All fields optional. */
export interface ThemeOverrides {
  /** Primary accent color (bubble, buttons, answer bubbles). */
  brand?: string;
  /** Highlight color for focused/selected form controls. Defaults to brand. */
  highlight?: string;
  /** Text/icon color shown *on top of* the brand color.
   *  Auto-computed from brand luminance if omitted. */
  onBrand?: string;
  /** Panel background color. */
  background?: string;
  /** Message bubble & input background. */
  surface?: string;
  /** Primary text color. */
  text?: string;
  /** Secondary / dim text color. */
  textMuted?: string;
  /** Border color for inputs and dividers. */
  border?: string;
  /** Corner radius for the panel (e.g. "18px"). */
  radius?: string;
  /** Body font family. */
  font?: string;
  /** Base font size for the widget (e.g. "15px"). */
  fontSize?: string;
  /** Header font family (defaults to body font). */
  headerFont?: string;
  /** Header title font size (e.g. "18px"). */
  headerFontSize?: string;
  /** Header background. Accepts a color or CSS gradient. */
  headerBackground?: string;
  /** Header text/icon color. */
  headerText?: string;
  /** Question bubble background. */
  questionBubbleBackground?: string;
  /** Question bubble foreground. */
  questionBubbleText?: string;
  /** Answer bubble background. */
  answerBubbleBackground?: string;
  /** Answer bubble foreground. */
  answerBubbleText?: string;
  /** Main conversation area padding. */
  padding?: string;
  /** Floating launcher background. */
  triggerBackground?: string;
  /** Floating launcher foreground. */
  triggerText?: string;
  /** Floating launcher border radius. Use "50%" for circular. */
  triggerRadius?: string;
}

/** Top-level flow definition — the JSON wire format contract. */
export interface FlowDefinition {
  id: string;
  version: string;
  meta?: {
    title?: string;
    subtitle?: string;
    /** Brand identity — set colors/fonts in `theme`, not here. */
    brand?: {
      name?: string;
      /** URL to a logo image. Rendered in the header, clipped to 60x60. */
      logo?: string;
    };
    /** Visual theme — every key maps to a widget CSS variable. */
    theme?: ThemeOverrides;
  };
  start: string;
  /** Server-issued session for authenticating `extract` round-trips.
   *  The widget carries `token` as a bearer credential; it never signs. */
  session?: {
    token: string;
    expires_at?: string;
    budget?: number;
  };
  /** Named running totals the flow accumulates into. */
  accumulators?: Record<string, AccumulatorDeclaration>;
  steps: Record<string, StepDefinition>;
}

/** Shape of a `POST {llm-prefix}/extract` response. Every field is optional so
 *  that a malformed or errored response degrades to the manual-form fallback. */
export interface ExtractResponse {
  step?: string;
  status?: "ok" | "partial" | "error";
  answers?: Answers;
  next?: string | null;
  meta?: Record<string, unknown>;
}

/** Map of accumulator name -> current numeric total. */
export type Totals = Record<string, number>;

/** Collected answers keyed by step id. */
export type Answers = Record<string, unknown>;

/** A completed Q&A entry in the conversation history. */
export interface HistoryEntry {
  stepId: string;
  step: StepDefinition;
  answer?: unknown;
}
