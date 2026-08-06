import { describe, expect, it, vi } from "vitest";
import { FlowEngine } from "../src/engine.js";
import { runServerVerb } from "../src/server-verb.js";
import type { FlowDefinition } from "../src/types.js";

/** A help-style flow that closes with a summarize step. */
function helpFlow(): FlowDefinition {
  return {
    id: "depreciation-help",
    version: "1.0.0",
    start: "intro",
    steps: {
      intro: {
        verb: "say",
        text: "Depreciation spreads an asset's cost over its useful life.",
        transitions: [{ to: "asset" }],
      },
      asset: {
        verb: "ask",
        type: "enum",
        question: "What kind of asset?",
        options: [
          { value: "vehicle", label: "A vehicle" },
          { value: "building", label: "A building" },
        ],
        transitions: [{ to: "wrap_up" }],
      },
      wrap_up: {
        verb: "summarize",
        requires_server: true,
      },
    },
  };
}

/** Drive the flow to its summarize step. */
function atSummarize(): FlowEngine {
  const engine = new FlowEngine(helpFlow());
  engine.acknowledge();
  engine.answer("vehicle");
  return engine;
}

const MARKDOWN = "## What we covered\n\nYou asked about a vehicle.";

describe("the summarize step", () => {
  it("is recognised as a server verb, distinct from extract", () => {
    const engine = atSummarize();
    expect(engine.currentStepId).toBe("wrap_up");
    expect(engine.currentStepIsSummarize).toBe(true);
    expect(engine.currentStepIsServerVerb).toBe(true);
    expect(engine.currentStepIsExtract).toBe(false);
  });

  it("starts with no summary", () => {
    expect(new FlowEngine(helpFlow()).summary).toBeNull();
  });
});

describe("applySummary", () => {
  it("stores the markdown and finishes the flow", () => {
    const engine = atSummarize();
    engine.applySummary(MARKDOWN);
    expect(engine.summary).toBe(MARKDOWN);
    expect(engine.finished).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    const engine = atSummarize();
    engine.applySummary(`\n\n${MARKDOWN}\n  `);
    expect(engine.summary).toBe(MARKDOWN);
  });

  it("treats blank or non-string output as no summary", () => {
    for (const value of ["", "   \n ", null, undefined, 42, {}]) {
      const engine = atSummarize();
      engine.applySummary(value);
      expect(engine.summary).toBeNull();
      expect(engine.finished).toBe(true);
    }
  });

  // A summary is prose for the user, not a value any rule should branch on,
  // and it must never be POSTed back as though the user had typed it.
  it("never lands in answers", () => {
    const engine = atSummarize();
    engine.applySummary(MARKDOWN);
    expect(engine.answers).not.toHaveProperty("wrap_up");
    expect(JSON.stringify(engine.toResult())).not.toContain("What we covered");
  });
});

describe("applySummaryResponse", () => {
  it("accepts a well-formed response", () => {
    const engine = atSummarize();
    engine.applySummaryResponse({ status: "ok", summary: MARKDOWN });
    expect(engine.summary).toBe(MARKDOWN);
  });

  it("degrades on status error, missing summary, and malformed bodies", () => {
    const bodies = [
      { status: "error" as const, summary: MARKDOWN },
      { status: "ok" as const },
      null,
      undefined,
    ];
    for (const body of bodies) {
      const engine = atSummarize();
      engine.applySummaryResponse(body);
      expect(engine.summary).toBeNull();
      expect(engine.finished).toBe(true);
    }
  });
});

describe("runServerVerb — the summarize round-trip", () => {
  it("posts verb=summarize and applies the returned markdown", async () => {
    const engine = atSummarize();
    let calledUrl = "";
    let body: Record<string, unknown> = {};
    const fn = vi.fn(async (url: string, init: RequestInit) => {
      calledUrl = url;
      body = JSON.parse(init.body as string);
      return {
        ok: true,
        json: async () => ({ status: "ok", summary: MARKDOWN }),
      } as Response;
    });

    await runServerVerb(engine, { llmUrl: "https://x.test/llm", fetchFn: fn });

    expect(calledUrl).toContain("verb=summarize");
    expect(body.verb).toBe("summarize");
    expect(body.step).toBe("wrap_up");
    expect(engine.summary).toBe(MARKDOWN);
    expect(engine.finished).toBe(true);
  });

  // An LLM outage must not strand the user on a spinner at the very end.
  it("finishes without a summary on a non-2xx response", async () => {
    const engine = atSummarize();
    const fn = vi.fn(async () => ({ ok: false, status: 500 }) as Response);

    await runServerVerb(engine, { llmUrl: "https://x.test/llm", fetchFn: fn });

    expect(engine.summary).toBeNull();
    expect(engine.finished).toBe(true);
  });

  it("finishes without a summary on a network error", async () => {
    const engine = atSummarize();
    const fn = vi.fn(async () => {
      throw new Error("offline");
    });

    await runServerVerb(engine, { llmUrl: "https://x.test/llm", fetchFn: fn });

    expect(engine.summary).toBeNull();
    expect(engine.finished).toBe(true);
  });

  it("finishes without a summary when no endpoint is configured", async () => {
    const engine = atSummarize();
    const fn = vi.fn();

    await runServerVerb(engine, { llmUrl: "", fetchFn: fn as never });

    expect(fn).not.toHaveBeenCalled();
    expect(engine.summary).toBeNull();
    expect(engine.finished).toBe(true);
  });

  // The summarize failure path must finish the flow, not advance it — there
  // is nothing after a summarize step to advance to.
  it("does not leave the engine parked on the summarize step after a failure", async () => {
    const engine = atSummarize();
    const fn = vi.fn(async () => ({ ok: false, status: 503 }) as Response);

    await runServerVerb(engine, { llmUrl: "https://x.test/llm", fetchFn: fn });

    expect(engine.finished).toBe(true);
    expect(engine.currentStepIsSummarize).toBe(false);
  });
});
