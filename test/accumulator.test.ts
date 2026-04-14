import { describe, it, expect } from "vitest";
import { FlowEngine, accumulationContribution } from "../src/engine.js";
import type { FlowDefinition, AccumulationShape } from "../src/types.js";

describe("accumulationContribution", () => {
  describe("lookup shape", () => {
    const shape: AccumulationShape = { lookup: { single: 200, mfj: 400 } };

    it("returns the amount matching the answer", () => {
      expect(accumulationContribution(shape, "single")).toBe(200);
      expect(accumulationContribution(shape, "mfj")).toBe(400);
    });

    it("returns 0 for unknown answers", () => {
      expect(accumulationContribution(shape, "hoh")).toBe(0);
    });

    it("returns 0 for nullish", () => {
      expect(accumulationContribution(shape, null)).toBe(0);
      expect(accumulationContribution(shape, undefined)).toBe(0);
    });
  });

  describe("per_unit shape", () => {
    const shape: AccumulationShape = { per_unit: 25 };

    it("multiplies rate by numeric answer", () => {
      expect(accumulationContribution(shape, 4)).toBe(100);
    });

    it("parses stringy numbers", () => {
      expect(accumulationContribution(shape, "3")).toBe(75);
    });

    it("returns 0 for non-numeric", () => {
      expect(accumulationContribution(shape, "banana")).toBe(0);
    });
  });

  describe("per_selection shape", () => {
    const shape: AccumulationShape = {
      per_selection: { c: 150, e: 75, d: 50 },
    };

    it("sums amounts for selected options", () => {
      expect(accumulationContribution(shape, ["c", "e"])).toBe(225);
    });

    it("ignores unknown selections", () => {
      expect(accumulationContribution(shape, ["c", "zzz"])).toBe(150);
    });

    it("returns 0 for non-array", () => {
      expect(accumulationContribution(shape, "c")).toBe(0);
    });
  });

  describe("flat shape", () => {
    const shape: AccumulationShape = { flat: 5 };

    it("adds the amount for truthy answers", () => {
      expect(accumulationContribution(shape, true)).toBe(5);
      expect(accumulationContribution(shape, "hi")).toBe(5);
    });

    it("is 0 for false and empty values", () => {
      expect(accumulationContribution(shape, false)).toBe(0);
      expect(accumulationContribution(shape, "")).toBe(0);
      expect(accumulationContribution(shape, [])).toBe(0);
    });
  });
});

describe("FlowEngine totals (pricing)", () => {
  const pricingFlow: FlowDefinition = {
    id: "tax-pricing",
    version: "1.0.0",
    start: "filing_status",
    accumulators: {
      price: { type: "currency", default: 0 },
      complexity: { type: "integer", default: 0 },
    },
    steps: {
      filing_status: {
        verb: "ask",
        type: "enum",
        question: "Filing status?",
        options: [
          { value: "single", label: "Single" },
          { value: "mfj", label: "MFJ" },
          { value: "hoh", label: "HoH" },
        ],
        accumulate: {
          price: { lookup: { single: 200, mfj: 400, hoh: 300 } },
          complexity: { lookup: { mfj: 1 } },
        },
        transitions: [{ to: "dependents" }],
      },
      dependents: {
        verb: "ask",
        type: "integer",
        question: "Dependents?",
        accumulate: { price: { per_unit: 25 } },
        transitions: [{ to: "schedules" }],
      },
      schedules: {
        verb: "ask",
        type: "multi_enum",
        question: "Schedules?",
        options: [
          { value: "c", label: "Schedule C" },
          { value: "e", label: "Schedule E" },
          { value: "d", label: "Schedule D" },
        ],
        accumulate: {
          price: { per_selection: { c: 150, e: 75, d: 50 } },
          complexity: { per_selection: { c: 2, e: 1, d: 1 } },
        },
        transitions: [{ to: "done" }],
      },
      done: { verb: "say", text: "Thanks!" },
    },
  };

  it("initializes totals from accumulator defaults", () => {
    const e = new FlowEngine(pricingFlow);
    expect(e.totals).toEqual({ price: 0, complexity: 0 });
  });

  it("simple single filer: only base fee", () => {
    const e = new FlowEngine(pricingFlow);
    e.answer("single");
    e.answer(0);
    e.answer([]);
    expect(e.total("price")).toBe(200);
    expect(e.total("complexity")).toBe(0);
  });

  it("MFJ + 3 deps + 2 schedules", () => {
    const e = new FlowEngine(pricingFlow);
    e.answer("mfj");
    e.answer(3);
    e.answer(["c", "e"]);
    // 400 + 3*25 + 150 + 75 = 700
    expect(e.total("price")).toBe(700);
    // mfj(1) + c(2) + e(1) = 4
    expect(e.total("complexity")).toBe(4);
  });

  it("exposes totals via toResult()", () => {
    const e = new FlowEngine(pricingFlow);
    e.answer("mfj");
    e.answer(0);
    e.answer([]);
    const result = e.toResult();
    expect(result.totals).toEqual({ price: 400, complexity: 1 });
  });

  it("undeclared accumulator reads 0", () => {
    const e = new FlowEngine(pricingFlow);
    expect(e.total("nonexistent")).toBe(0);
  });
});
