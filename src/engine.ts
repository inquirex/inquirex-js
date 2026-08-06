import type {
  FlowDefinition,
  StepDefinition,
  Answers,
  RuleDefinition,
  HistoryEntry,
  AccumulationShape,
  Totals,
  ExtractResponse,
  SummaryResponse,
} from "./types.js";

/**
 * Evaluates a serialized rule AST against collected answers.
 * Port of the Ruby Inquirex::Evaluator.
 */
export function evaluateRule(rule: RuleDefinition, answers: Answers): boolean {
  switch (rule.op) {
    case "equals":
      return answers[rule.field] === rule.value;

    case "contains": {
      const val = answers[rule.field];
      if (Array.isArray(val)) return val.includes(rule.value);
      if (typeof val === "string" && typeof rule.value === "string")
        return val.includes(rule.value);
      return false;
    }

    case "greater_than": {
      const num = Number(answers[rule.field]);
      return !Number.isNaN(num) && num > rule.value;
    }

    case "less_than": {
      const num = Number(answers[rule.field]);
      return !Number.isNaN(num) && num < rule.value;
    }

    case "not_empty": {
      const val = answers[rule.field];
      if (val == null) return false;
      if (typeof val === "string") return val.trim().length > 0;
      if (Array.isArray(val)) return val.length > 0;
      return true;
    }

    case "all":
      return rule.rules.every((r) => evaluateRule(r, answers));

    case "any":
      return rule.rules.some((r) => evaluateRule(r, answers));
  }
}

/** Whether a verb collects user input. */
function isCollecting(verb: string): boolean {
  return verb === "ask" || verb === "confirm";
}

/**
 * Canonicalizes a raw extracted value against a step's options: an exact
 * form-value match wins, then a case-insensitive value match, then a
 * case-insensitive label match — LLMs (and humans) often answer with the
 * friendly label ("US citizen or permanent resident") when the form value is
 * the canonical key ("us_person"). Matching always resolves TO the form
 * value, never the label. Steps without options return the value unchanged;
 * an unmatchable value returns null rather than polluting answers with junk
 * that would satisfy not_empty rules and pre-select the wrong option.
 *
 * Port of the Ruby Inquirex::Node#resolve_option.
 */
export function canonicalOption(step: StepDefinition, raw: unknown): unknown {
  const opts = step.options;
  if (!opts || opts.length === 0) return raw;
  if (raw === null || raw === undefined) return null;

  const candidate = String(raw);
  const exact = opts.find((o) => o.value === candidate);
  if (exact) return exact.value;

  const lc = candidate.toLowerCase();
  const ci = opts.find((o) => o.value.toLowerCase() === lc);
  if (ci) return ci.value;

  const byLabel = opts.find((o) => o.label?.toLowerCase() === lc);
  if (byLabel) return byLabel.value;

  return null;
}

/**
 * Computes a single accumulation's contribution from the answer.
 * Mirrors Inquirex::Accumulation#contribution in Ruby.
 */
export function accumulationContribution(
  shape: AccumulationShape,
  answer: unknown,
): number {
  if (answer == null) return 0;

  if ("lookup" in shape) {
    const key = String(answer);
    return Number(shape.lookup[key] ?? 0);
  }

  if ("per_selection" in shape) {
    if (!Array.isArray(answer)) return 0;
    return answer.reduce<number>(
      (sum, sel) => sum + Number(shape.per_selection[String(sel)] ?? 0),
      0,
    );
  }

  if ("per_unit" in shape) {
    const n = typeof answer === "number" ? answer : Number(answer);
    return Number.isFinite(n) ? n * shape.per_unit : 0;
  }

  if ("flat" in shape) {
    if (answer === false) return 0;
    if (typeof answer === "string" && answer.length === 0) return 0;
    if (Array.isArray(answer) && answer.length === 0) return 0;
    return shape.flat;
  }

  return 0;
}

/**
 * Client-side flow engine. Walks the definition graph, evaluates rules,
 * and tracks collected answers + history.
 *
 * Steps marked `requires_server: true` on their transitions are flagged
 * so the widget can round-trip to the server.
 */
export class FlowEngine {
  readonly definition: FlowDefinition;
  readonly answers: Answers = {};
  readonly history: HistoryEntry[] = [];
  readonly totals: Totals;
  /** Multi-select prefill hints from an `extract` step: the question is
   *  still asked with these choices pre-checked, so the user can confirm and
   *  extend. Mirrors the Ruby Engine's `suggestions` channel. */
  readonly suggestions: Record<string, string[]> = {};

  private _currentStepId: string;
  private _finished = false;
  private _summary: string | null = null;

  constructor(definition: FlowDefinition) {
    this.definition = definition;
    this._currentStepId = definition.start;
    this.totals = {};
    for (const [name, decl] of Object.entries(definition.accumulators ?? {})) {
      this.totals[name] = Number(decl.default ?? 0);
    }
    this.skipIfNeeded();
  }

  /** Running total for the given accumulator (e.g. "price"). Returns 0 if undeclared. */
  total(name: string): number {
    return this.totals[name] ?? 0;
  }

  get currentStepId(): string {
    return this._currentStepId;
  }

  get currentStep(): StepDefinition {
    return this.definition.steps[this._currentStepId];
  }

  get finished(): boolean {
    return this._finished;
  }

  get totalSteps(): number {
    return Object.keys(this.definition.steps).length;
  }

  /** The prefill suggestion for a step, or null when none was recorded. */
  suggestionFor(stepId: string): string[] | null {
    return this.suggestions[stepId] ?? null;
  }

  /** Submit an answer for the current collecting step and advance. */
  answer(value: unknown): void {
    const step = this.currentStep;
    if (!isCollecting(step.verb)) {
      throw new Error(`Cannot answer a ${step.verb} step`);
    }

    this.answers[this._currentStepId] = value;
    delete this.suggestions[this._currentStepId];
    this.applyAccumulations(step, value);
    this.history.push({ stepId: this._currentStepId, step, answer: value });
    this.advance();
  }

  private applyAccumulations(step: StepDefinition, answer: unknown): void {
    for (const [name, shape] of Object.entries(step.accumulate ?? {})) {
      this.totals[name] =
        (this.totals[name] ?? 0) + accumulationContribution(shape, answer);
    }
  }

  /** Advance past a display step (no answer collected). */
  acknowledge(): void {
    const step = this.currentStep;
    this.history.push({ stepId: this._currentStepId, step });
    this.advance();
  }

  /** First transition whose rule passes (an unconditional transition always
   *  passes) — the same in-order resolution the Ruby Node#next_step_id uses. */
  private resolveNext(step: StepDefinition): string | null {
    for (const t of step.transitions ?? []) {
      if (!t.rule || evaluateRule(t.rule, this.answers)) return t.to;
    }
    return null;
  }

  /** Resolve the next step via transition rules and move there. */
  private advance(): void {
    const nextId = this.resolveNext(this.currentStep);

    if (!nextId || !this.definition.steps[nextId]) {
      this._finished = true;
      return;
    }

    this._currentStepId = nextId;
    this.skipIfNeeded();
  }

  /** Auto-skip steps whose skip_if rule evaluates to true, and collecting
   *  steps whose answer already exists (prefilled by an `extract` step) —
   *  an answered question is never asked again. Transitions are resolved
   *  with rule evaluation, so a skipped step still branches correctly on
   *  the answer that skipped it. */
  private skipIfNeeded(): void {
    let guard = 100;
    while (guard-- > 0) {
      const step = this.definition.steps[this._currentStepId];
      if (!step) {
        this._finished = true;
        return;
      }
      const answered =
        isCollecting(step.verb) &&
        this.answers[this._currentStepId] !== undefined;
      const elided = !!step.skip_if && evaluateRule(step.skip_if, this.answers);
      if (!answered && !elided) return;

      const nextId = this.resolveNext(step);
      if (!nextId || !this.definition.steps[nextId]) {
        this._finished = true;
        return;
      }
      this._currentStepId = nextId;
    }
  }

  /** Returns true if the current step needs a server round-trip. */
  get currentStepRequiresServer(): boolean {
    return !!this.currentStep?.requires_server;
  }

  /** Returns true if the current step is a server-side `extract` (alias
   *  `clarify`): it collects no user input and must round-trip to the server. */
  get currentStepIsExtract(): boolean {
    if (this._finished) return false;
    const verb = this.currentStep?.verb;
    return verb === "extract" || verb === "clarify";
  }

  /** Returns true if the current step is a server-side `summarize`: the
   *  closing step, which returns markdown prose instead of answers. */
  get currentStepIsSummarize(): boolean {
    if (this._finished) return false;
    return this.currentStep?.verb === "summarize";
  }

  /** Returns true if the current step needs the LLM endpoint at all.
   *
   *  These three getters check {@link finished} because finishing does not
   *  clear `_currentStepId` — the engine stays parked on the last step it
   *  reached. Without the guard, a caller that drove a loop on
   *  "is this a server step?" alone would never exit after a summarize step,
   *  since summarize both is a server verb and is where the flow ends. */
  get currentStepIsServerVerb(): boolean {
    return this.currentStepIsExtract || this.currentStepIsSummarize;
  }

  /**
   * Markdown summary produced by a `summarize` step, or null when the flow
   * has none, has not reached it yet, or the call failed.
   *
   * Kept apart from {@link answers} on purpose: a summary is prose for the
   * user to read, not a value any rule should branch on, and it must never be
   * submitted back as though the user had typed it.
   */
  get summary(): string | null {
    return this._summary;
  }

  /**
   * Store the markdown a `summarize` step returned and finish the flow.
   *
   * `summarize` is always the last step, so there is nothing to advance to —
   * the widget renders the summary in place of the completion screen.
   *
   * @param markdown the model's summary, or nothing usable
   */
  applySummary(markdown: unknown): void {
    const text = typeof markdown === "string" ? markdown.trim() : "";
    this._summary = text === "" ? null : text;
    this._finished = true;
  }

  /**
   * Interpret a raw summarize response. Anything malformed, errored, or empty
   * degrades to {@link failSummary} — a missing summary must not block the
   * user from finishing.
   */
  applySummaryResponse(data: SummaryResponse | null | undefined): void {
    if (data && typeof data === "object" && data.status !== "error" && data.summary) {
      this.applySummary(data.summary);
      return;
    }
    this.failSummary();
  }

  /**
   * Fallback when a `summarize` round-trip fails. Finishes the flow with no
   * summary, so the widget shows its ordinary completion screen. As with
   * extraction, an LLM outage degrades the experience rather than breaking it.
   */
  failSummary(): void {
    this._summary = null;
    this._finished = true;
  }

  /**
   * Apply structured answers returned by the server for an `extract` step,
   * then move to the server-chosen `next` step. Every filled single-select
   * question is treated as answered and auto-skips when reached — this is
   * what collapses a long form into a short one, with or without `skip_if`
   * rules in the flow.
   *
   * Values for option steps are canonicalized against the option FORM
   * VALUES (case-insensitive, with a label fallback) via
   * {@link canonicalOption}; anything unmatchable is dropped so the model
   * can never pre-select the wrong option. Multi-select extractions are
   * hints, not facts: they land in {@link suggestions} (pre-checked in the
   * UI, question still asked), never directly in answers. Nullish and empty
   * fields are ignored, so an "unknown" extraction leaves its question
   * asked.
   */
  applyExtraction(fields: Answers, next?: string | null): void {
    for (const [key, value] of Object.entries(fields ?? {})) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      if (Array.isArray(value) && value.length === 0) continue;
      if (this.answers[key] !== undefined) continue;

      const step = this.definition.steps[key];
      if (step && isCollecting(step.verb) && step.type === "multi_enum") {
        const resolved = (Array.isArray(value) ? value : [value])
          .map((entry) => canonicalOption(step, entry))
          .filter((v): v is string => typeof v === "string");
        if (resolved.length > 0) this.suggestions[key] = resolved;
      } else if (step && isCollecting(step.verb)) {
        const resolved = canonicalOption(step, value);
        if (resolved !== null) this.answers[key] = resolved;
      } else {
        // Schema-only fields with no matching step (e.g. a confidence
        // score) are stored verbatim so rules can still read them.
        this.answers[key] = value;
      }
    }

    if (next && this.definition.steps[next]) {
      this._currentStepId = next;
      this.skipIfNeeded();
    } else {
      // No usable target from the server — fall back to the step's own
      // transitions so the flow still advances.
      this.advance();
    }
  }

  /**
   * Fallback when an `extract` round-trip fails (network error, timeout, non-2xx,
   * or `status: "error"`). Advances past the server step with no pre-filled
   * answers, so every downstream question is asked normally. The flow never
   * breaks on an LLM failure — it degrades to a plain form.
   */
  failExtraction(): void {
    this.advance();
  }

  /**
   * Interpret a raw `/extract` response and apply it. A well-formed response
   * (object, `status` not `"error"`) merges its answers and jumps to `next`;
   * anything malformed or errored degrades to {@link failExtraction}. This is
   * the single decision point the widget delegates to after a 2xx fetch.
   */
  applyExtractResponse(data: ExtractResponse | null | undefined): void {
    if (data && typeof data === "object" && data.status !== "error") {
      this.applyExtraction(data.answers ?? {}, data.next ?? null);
    } else {
      this.failExtraction();
    }
  }

  /** Build the final result payload. */
  toResult(): Record<string, unknown> {
    return {
      flow_id: this.definition.id,
      version: this.definition.version,
      answers: { ...this.answers },
      totals: { ...this.totals },
      path_taken: this.history.map((h) => h.stepId),
      steps_completed: this.history.length,
      completed_at: new Date().toISOString(),
    };
  }
}
