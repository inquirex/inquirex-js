import type {
  FlowDefinition,
  StepDefinition,
  Answers,
  RuleDefinition,
  HistoryEntry,
} from "./types.js";

/**
 * Evaluates a serialized rule AST against collected answers.
 * Port of the Ruby Inquirex::Evaluator.
 */
export function evaluateRule(
  rule: RuleDefinition,
  answers: Answers,
): boolean {
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
      return !isNaN(num) && num > rule.value;
    }

    case "less_than": {
      const num = Number(answers[rule.field]);
      return !isNaN(num) && num < rule.value;
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

  private _currentStepId: string;
  private _finished = false;

  constructor(definition: FlowDefinition) {
    this.definition = definition;
    this._currentStepId = definition.start;
    this.skipIfNeeded();
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
    this.history.push({ stepId: this._currentStepId, step, answer: value });
    this.advance();
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

  /** Build the final result payload. */
  toResult(): Record<string, unknown> {
    return {
      flow_id: this.definition.id,
      version: this.definition.version,
      answers: { ...this.answers },
      path_taken: this.history.map((h) => h.stepId),
      steps_completed: this.history.length,
      completed_at: new Date().toISOString(),
    };
  }
}
