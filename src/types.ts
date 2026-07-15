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
 *  on the widget's shadow root. All fields optional.
 *
 *  Every one of these can also be set directly from the host page's CSS by
 *  targeting the element — e.g. `inquirex-widget { --iq-radius: 0; }` — because
 *  custom properties inherit through the shadow boundary. Values supplied here
 *  (or in the flow's `meta.theme`) are applied as inline style and therefore
 *  win over host-page stylesheet rules. Precedence, lowest to highest:
 *  built-in defaults < host-page CSS < this object / flow theme. */
export interface ThemeOverrides {
  // ── Brand ──
  /** Primary accent color (launcher, buttons, answer bubbles). */
  brand?: string;
  /** Text/icon color shown *on top of* the brand color.
   *  Auto-computed from brand luminance if omitted. */
  onBrand?: string;

  // ── Surfaces ──
  /** Chat-window (panel) background color. */
  background?: string;
  /** Input & bubble surface background. */
  surface?: string;
  /** Primary text color. */
  text?: string;
  /** Secondary / dim text color. */
  textMuted?: string;
  /** Border color for inputs and dividers. */
  border?: string;

  // ── Header ──
  /** Header background — a solid color or any CSS `background` value
   *  (defaults to a brand gradient). */
  headerBg?: string;
  /** Header text/icon color (defaults to `onBrand`). */
  headerText?: string;
  /** Header title font size, e.g. "18px". */
  headerFontSize?: string;

  // ── Form widgets ──
  /** Selection / focus accent for the form widgets — radios, checkboxes,
   *  inputs (defaults to `brand`). */
  highlight?: string;

  // ── Chat bubbles ──
  /** Question-bubble background (defaults to `surface`). */
  bubbleQuestionBg?: string;
  /** Question-bubble text color (defaults to `text`). */
  bubbleQuestionText?: string;
  /** Answer-bubble background (defaults to `brand`). */
  bubbleAnswerBg?: string;
  /** Answer-bubble text color (defaults to `onBrand`). */
  bubbleAnswerText?: string;

  // ── Launcher ──
  /** Floating launcher button background (defaults to `brand`). */
  launcherBg?: string;
  /** Floating launcher icon color (defaults to `onBrand`). */
  launcherIcon?: string;
  /** Launcher diameter, e.g. "60px". */
  launcherSize?: string;
  /** Launcher corner radius. "50%" (default) is circular; "12px" is a squircle;
   *  "0" is square. */
  launcherRadius?: string;

  // ── Panel geometry ──
  /** Panel width, e.g. "400px". */
  panelWidth?: string;
  /** Panel maximum height, e.g. "620px". */
  panelMaxHeight?: string;
  /** Distance from the bottom edge of the viewport, e.g. "24px". */
  offsetBlock?: string;
  /** Distance from the left/right edge (whichever `position` anchors to),
   *  e.g. "24px". */
  offsetInline?: string;

  // ── Geometry & type ──
  /** Corner radius for the panel, e.g. "18px" (use "0" for square). */
  radius?: string;
  /** Inner padding of the conversation area, e.g. "16px". */
  padding?: string;
  /** Body font family. */
  font?: string;
  /** Base font size for the widget, e.g. "15px". */
  fontSize?: string;
  /** Header font family (defaults to body font). */
  headerFont?: string;

  /** Escape hatch: any raw `--iq-*` custom property, set verbatim. Lets you
   *  reach a variable that has no named key yet — e.g.
   *  `{ "--iq-brand-dark": "#123456" }`. */
  [rawVar: `--iq-${string}`]: string | undefined;
}

/** How the copilot first opens. */
export type TriggerMode =
  /** Stay collapsed until the visitor clicks the launcher (default). */
  | "click"
  /** Open automatically as soon as the widget loads. */
  | "auto"
  /** Open automatically after `triggerDelay` ms. */
  | "delay";

/** Which screen corner the widget anchors to. */
export type WidgetPosition = "bottom-right" | "bottom-left";

/**
 * The complete embedder-facing configuration. Every field is optional; the
 * widget resolves a value for each from (highest precedence first):
 *   1. an explicit {@link mount} argument,
 *   2. `data-inquirex-*` attributes on the loading `<script>`,
 *   3. a `window.InquirexConfig` global,
 *   4. a build-time baked config (qualified.at per-form bundle),
 *   5. built-in defaults.
 * See `src/config.ts`.
 */
export interface InquirexConfig {
  /** GET the flow definition JSON here. Also the POST target for completed
   *  answers unless {@link submitUrl} is set. (`data-inquirex-url`) */
  url?: string;
  /** Inline flow definition — skips the GET entirely. (`data-inquirex-json`,
   *  passed as a JSON string; or a parsed object programmatically.) */
  json?: string | FlowDefinition;
  /** Convenience: derive `url` from a qualified.at site id. (`data-inquirex-site-id`) */
  siteId?: string;
  /** POST completed answers here. Falls back to {@link url}. (`data-inquirex-submit-to`) */
  submitUrl?: string;
  /** POST LLM verbs (`extract`, …) here. Omit to disable LLM steps — they then
   *  degrade to plain form questions. (`data-inquirex-llm-url`) */
  llmUrl?: string;
  /** Client timeout (ms) for one LLM round-trip before falling back.
   *  (`data-inquirex-llm-timeout`, default 20000) */
  llmTimeout?: number;
  /** Opaque, server-signed token forwarded on every request as
   *  `Authorization: Bearer <token>`. The server binds it to the embedding
   *  origin + form and verifies it; the widget never computes it.
   *  (`data-inquirex-auth`; also read from the flow's `session.token`.) */
  auth?: string;
  /** Origins this embed is allowed to run on (e.g. `["https://example.com"]`).
   *  When set, the widget refuses to initialize anywhere else — a cheap guard
   *  against a copied script tag. NOT a security boundary (it runs in the
   *  browser); real enforcement is the server's Origin check. Empty = any
   *  origin. (`data-inquirex-origins`, comma-separated.) */
  origins?: string[];
  /** How the copilot first opens. (`data-inquirex-trigger`, default "click") */
  trigger?: TriggerMode;
  /** Delay in ms when `trigger` is "delay". (`data-inquirex-trigger-delay`, default 1000) */
  triggerDelay?: number;
  /** Screen corner to anchor to. (`data-inquirex-position`, default "bottom-right") */
  position?: WidgetPosition;
  /** Visual theme overrides (also settable via the flow's `meta.theme` or host CSS). */
  theme?: ThemeOverrides;
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
