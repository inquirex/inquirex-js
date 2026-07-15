import type {
  FlowDefinition,
  StepDefinition,
  Answers,
  RuleDefinition,
  HistoryEntry,
  AccumulationShape,
  Totals,
  ExtractResponse,
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

  private _currentStepId: string;
  private _finished = false;

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

  /** Submit an answer for the current collecting step and advance. */
  answer(value: unknown): void {
    const step = this.currentStep;
    if (!isCollecting(step.verb)) {
      throw new Error(`Cannot answer a ${step.verb} step`);
    }

    this.answers[this._currentStepId] = value;
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

  /** Resolve the next step via transition rules and move there. */
  private advance(): void {
    const step = this.currentStep;
    const transitions = step.transitions ?? [];

    let nextId: string | null = null;
    for (const t of transitions) {
      if (!t.rule || evaluateRule(t.rule, this.answers)) {
        nextId = t.to;
        break;
      }
    }

    if (!nextId || !this.definition.steps[nextId]) {
      this._finished = true;
      return;
    }

    this._currentStepId = nextId;
    this.skipIfNeeded();
  }

  /** Auto-skip steps whose skip_if rule evaluates to true. */
  private skipIfNeeded(): void {
    let guard = 100;
    while (guard-- > 0) {
      const step = this.definition.steps[this._currentStepId];
      if (!step) {
        this._finished = true;
        return;
      }
      if (step.skip_if && evaluateRule(step.skip_if, this.answers)) {
        // Skip this step — advance via its default transition
        const transitions = step.transitions ?? [];
        const next = transitions[transitions.length - 1];
        if (next) {
          this._currentStepId = next.to;
        } else {
          this._finished = true;
          return;
        }
      } else {
        return;
      }
    }
  }

  /** Returns true if the current step needs a server round-trip. */
  get currentStepRequiresServer(): boolean {
    return !!this.currentStep?.requires_server;
  }

  /** Returns true if the current step is a server-side `extract` (alias
   *  `clarify`): it collects no user input and must round-trip to the server. */
  get currentStepIsExtract(): boolean {
    const verb = this.currentStep?.verb;
    return verb === "extract" || verb === "clarify";
  }

  /**
   * Apply structured answers returned by the server for an `extract` step,
   * then move to the server-chosen `next` step. Downstream steps guarded by
   * `skip_if: not_empty(field)` auto-skip for every field the server filled —
   * this is what collapses a long form into a short one.
   *
   * Only non-nullish fields are merged, so a field the model could not
   * determine is left unset and its question is still asked.
   */
  applyExtraction(fields: Answers, next?: string | null): void {
    for (const [key, value] of Object.entries(fields ?? {})) {
      if (value !== undefined && value !== null) {
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
