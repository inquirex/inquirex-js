import { describe, it, expect } from "vitest";
import { FlowEngine, evaluateRule } from "../src/engine.js";
import type { FlowDefinition, RuleDefinition } from "../src/types.js";

const flow = (overrides: Partial<FlowDefinition> = {}): FlowDefinition => ({
  id: "test",
  version: "1.0.0",
  start: "a",
  steps: {
    a: {
      verb: "ask",
      type: "string",
      question: "A?",
      transitions: [{ to: "b" }],
    },
    b: {
      verb: "ask",
      type: "integer",
      question: "B?",
      transitions: [{ to: "c" }],
    },
    c: { verb: "say", text: "Done" },
  },
  ...overrides,
});

describe("evaluateRule", () => {
  const answers = {
    name: "Alice",
    age: 30,
    tags: ["red", "blue"],
    empty: "",
    nothing: null,
  };

  it("equals: true when field matches", () => {
    expect(
      evaluateRule({ op: "equals", field: "name", value: "Alice" }, answers),
    ).toBe(true);
  });

  it("equals: false when field differs", () => {
    expect(
      evaluateRule({ op: "equals", field: "name", value: "Bob" }, answers),
    ).toBe(false);
  });

  it("contains: true for array membership", () => {
    expect(
      evaluateRule({ op: "contains", field: "tags", value: "red" }, answers),
    ).toBe(true);
  });

  it("contains: false for missing array element", () => {
    expect(
      evaluateRule({ op: "contains", field: "tags", value: "green" }, answers),
    ).toBe(false);
  });

  it("contains: works on strings too", () => {
    expect(
      evaluateRule({ op: "contains", field: "name", value: "lic" }, answers),
    ).toBe(true);
  });

  it("contains: false for non-array, non-string field", () => {
    expect(
      evaluateRule({ op: "contains", field: "age", value: 30 }, answers),
    ).toBe(false);
  });

  it("greater_than: true when numerically greater", () => {
    expect(
      evaluateRule({ op: "greater_than", field: "age", value: 18 }, answers),
    ).toBe(true);
  });

  it("greater_than: false when equal or less", () => {
    expect(
      evaluateRule({ op: "greater_than", field: "age", value: 30 }, answers),
    ).toBe(false);
    expect(
      evaluateRule({ op: "greater_than", field: "age", value: 50 }, answers),
    ).toBe(false);
  });

  it("less_than: true when numerically less", () => {
    expect(
      evaluateRule({ op: "less_than", field: "age", value: 50 }, answers),
    ).toBe(true);
  });

  it("not_empty: false for null, empty string, empty array", () => {
    expect(evaluateRule({ op: "not_empty", field: "nothing" }, answers)).toBe(
      false,
    );
    expect(evaluateRule({ op: "not_empty", field: "empty" }, answers)).toBe(
      false,
    );
    expect(evaluateRule({ op: "not_empty", field: "missing" }, answers)).toBe(
      false,
    );
    expect(
      evaluateRule({ op: "not_empty", field: "emptyArr" }, { emptyArr: [] }),
    ).toBe(false);
  });

  it("not_empty: true for real values", () => {
    expect(evaluateRule({ op: "not_empty", field: "name" }, answers)).toBe(
      true,
    );
    expect(evaluateRule({ op: "not_empty", field: "tags" }, answers)).toBe(
      true,
    );
    expect(evaluateRule({ op: "not_empty", field: "age" }, answers)).toBe(true);
  });

  it("all: logical AND of nested rules", () => {
    const rule: RuleDefinition = {
      op: "all",
      rules: [
        { op: "equals", field: "name", value: "Alice" },
        { op: "greater_than", field: "age", value: 20 },
      ],
    };
    expect(evaluateRule(rule, answers)).toBe(true);
  });

  it("all: short-circuits to false on any failing rule", () => {
    const rule: RuleDefinition = {
      op: "all",
      rules: [
        { op: "equals", field: "name", value: "Alice" },
        { op: "equals", field: "age", value: 99 },
      ],
    };
    expect(evaluateRule(rule, answers)).toBe(false);
  });

  it("any: true if any nested rule passes", () => {
    const rule: RuleDefinition = {
      op: "any",
      rules: [
        { op: "equals", field: "name", value: "Nope" },
        { op: "contains", field: "tags", value: "blue" },
      ],
    };
    expect(evaluateRule(rule, answers)).toBe(true);
  });

  it("any: false when all nested rules fail", () => {
    const rule: RuleDefinition = {
      op: "any",
      rules: [
        { op: "equals", field: "name", value: "Nope" },
        { op: "equals", field: "age", value: 99 },
      ],
    };
    expect(evaluateRule(rule, answers)).toBe(false);
  });
});

describe("FlowEngine", () => {
  it("starts at the definition's start step", () => {
    const engine = new FlowEngine(flow());
    expect(engine.currentStepId).toBe("a");
    expect(engine.finished).toBe(false);
  });

  it("advances through a linear flow on answer()", () => {
    const engine = new FlowEngine(flow());
    engine.answer("Alice");
    expect(engine.currentStepId).toBe("b");
    engine.answer(30);
    expect(engine.currentStepId).toBe("c");
  });

  it("collects answers keyed by step id", () => {
    const engine = new FlowEngine(flow());
    engine.answer("Alice");
    engine.answer(30);
    expect(engine.answers).toEqual({ a: "Alice", b: 30 });
  });

  it("records history entries", () => {
    const engine = new FlowEngine(flow());
    engine.answer("Alice");
    expect(engine.history).toHaveLength(1);
    expect(engine.history[0]).toMatchObject({ stepId: "a", answer: "Alice" });
  });

  it("throws when calling answer() on a display step", () => {
    const engine = new FlowEngine(flow());
    engine.answer("Alice");
    engine.answer(30);
    expect(() => engine.answer("wat")).toThrow(/Cannot answer a say step/);
  });

  it("acknowledge() advances past display steps", () => {
    const engine = new FlowEngine(flow());
    engine.answer("Alice");
    engine.answer(30);
    expect(engine.currentStep.verb).toBe("say");
    engine.acknowledge();
    expect(engine.finished).toBe(true);
  });

  it("marks finished when no next step resolves", () => {
    const engine = new FlowEngine(flow());
    engine.answer("Alice");
    engine.answer(30);
    engine.acknowledge();
    expect(engine.finished).toBe(true);
  });

  it("follows conditional transitions with rules", () => {
    const branching = flow({
      steps: {
        a: {
          verb: "ask",
          type: "enum",
          question: "?",
          transitions: [
            {
              to: "yes_branch",
              rule: { op: "equals", field: "a", value: "yes" },
            },
            { to: "no_branch" },
          ],
        },
        yes_branch: { verb: "say", text: "yes" },
        no_branch: { verb: "say", text: "no" },
      },
    });
    const e1 = new FlowEngine(branching);
    e1.answer("yes");
    expect(e1.currentStepId).toBe("yes_branch");

    const e2 = new FlowEngine(branching);
    e2.answer("no");
    expect(e2.currentStepId).toBe("no_branch");
  });

  it("skip_if auto-skips a step without requiring interaction", () => {
    const withSkip = flow({
      start: "a",
      steps: {
        a: {
          verb: "ask",
          type: "string",
          question: "Name?",
          transitions: [{ to: "b" }],
        },
        b: {
          verb: "ask",
          type: "integer",
          question: "Age?",
          skip_if: { op: "equals", field: "a", value: "skip-me" },
          transitions: [{ to: "c" }],
        },
        c: { verb: "say", text: "Done" },
      },
    });
    const engine = new FlowEngine(withSkip);
    engine.answer("skip-me");
    // After answering 'a', the engine advances to 'b', sees skip_if matches, jumps to 'c'
    expect(engine.currentStepId).toBe("c");
  });

  it("toResult produces a serializable result payload", () => {
    const engine = new FlowEngine(flow());
    engine.answer("Alice");
    engine.answer(30);
    engine.acknowledge();
    const result = engine.toResult();
    expect(result).toMatchObject({
      flow_id: "test",
      version: "1.0.0",
      answers: { a: "Alice", b: 30 },
      path_taken: ["a", "b", "c"],
      steps_completed: 3,
    });
    expect(typeof result.completed_at).toBe("string");
  });

  it("totalSteps returns the count of steps", () => {
    const engine = new FlowEngine(flow());
    expect(engine.totalSteps).toBe(3);
  });
});
