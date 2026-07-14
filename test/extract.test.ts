import { describe, it, expect } from "vitest";
import { FlowEngine } from "../src/engine.js";
import { runExtraction } from "../src/extract-client.js";
import type { FlowDefinition, ExtractResponse } from "../src/types.js";

/**
 * A flow modelled on `09_tax_preparer_llm`: a free-text `describe` step feeds an
 * `extract` step, whose structured output pre-fills four downstream questions
 * guarded by `skip_if: not_empty(field)`. A final `client_contact` question is
 * never extractable and must always be asked.
 */
const flow = (overrides: Partial<FlowDefinition> = {}): FlowDefinition => ({
  id: "tax-llm",
  version: "1.0.0",
  start: "describe",
  steps: {
    describe: {
      verb: "ask",
      type: "text",
      question: "Describe your situation.",
      transitions: [{ to: "extracted" }],
    },
    extracted: {
      verb: "extract",
      requires_server: true,
      thinking_label: "Reading your description…",
      transitions: [{ to: "filing_status", requires_server: true }],
    },
    filing_status: {
      verb: "ask",
      type: "enum",
      question: "Filing status?",
      skip_if: { op: "not_empty", field: "filing_status" },
      transitions: [{ to: "dependents" }],
    },
    dependents: {
      verb: "ask",
      type: "integer",
      question: "Dependents?",
      skip_if: { op: "not_empty", field: "dependents" },
      transitions: [{ to: "income_types" }],
    },
    income_types: {
      verb: "ask",
      type: "multi_enum",
      question: "Income types?",
      skip_if: { op: "not_empty", field: "income_types" },
      transitions: [{ to: "state_filing" }],
    },
    state_filing: {
      verb: "ask",
      type: "string",
      question: "State?",
      skip_if: { op: "not_empty", field: "state_filing" },
      transitions: [{ to: "client_contact" }],
    },
    client_contact: {
      verb: "ask",
      type: "string",
      question: "Name and email?",
      transitions: [{ to: "done" }],
    },
    done: { verb: "say", text: "Thanks!" },
  },
  ...overrides,
});

/** Answer `describe` and land on the `extracted` server step. */
function atExtractStep(def = flow()): FlowEngine {
  const engine = new FlowEngine(def);
  engine.answer(
    "We're married, two kids, a W-2 and some freelance, California.",
  );
  return engine;
}

describe("currentStepIsExtract", () => {
  it("is false on a normal ask step", () => {
    const engine = new FlowEngine(flow());
    expect(engine.currentStepIsExtract).toBe(false);
  });

  it("is true once the flow reaches an extract step", () => {
    const engine = atExtractStep();
    expect(engine.currentStepId).toBe("extracted");
    expect(engine.currentStepIsExtract).toBe(true);
  });

  it("recognizes the `clarify` alias", () => {
    const def = flow();
    def.steps.extracted.verb = "clarify";
    const engine = atExtractStep(def);
    expect(engine.currentStepIsExtract).toBe(true);
  });
});

describe("applyExtraction — the happy path", () => {
  it("merges fields and skips every question they answer", () => {
    const engine = atExtractStep();
    engine.applyExtraction(
      {
        filing_status: "married_filing_jointly",
        dependents: 2,
        income_types: ["W2", "1099"],
        state_filing: "California",
      },
      "filing_status",
    );

    // All four extractable questions were skipped; only client_contact remains.
    expect(engine.currentStepId).toBe("client_contact");
    expect(engine.finished).toBe(false);
    expect(engine.answers.filing_status).toBe("married_filing_jointly");
    expect(engine.answers.dependents).toBe(2);
  });

  it("only skips the questions it could fill; the rest are still asked", () => {
    const engine = atExtractStep();
    // Model was confident about filing status only.
    engine.applyExtraction({ filing_status: "single" }, "filing_status");

    // filing_status skips; dependents is the next unanswered question.
    expect(engine.currentStepId).toBe("dependents");
  });

  it("ignores null/undefined fields rather than marking them answered", () => {
    const engine = atExtractStep();
    engine.applyExtraction(
      { filing_status: "single", dependents: null, state_filing: undefined },
      "filing_status",
    );

    expect(engine.answers.filing_status).toBe("single");
    expect("dependents" in engine.answers).toBe(false);
    // filing_status skipped → dependents asked (it wasn't filled).
    expect(engine.currentStepId).toBe("dependents");
  });

  it("empty-string is treated as filled and does NOT skip (not_empty is false)", () => {
    const engine = atExtractStep();
    // A model returning "" for state must not suppress the question.
    engine.applyExtraction({ state_filing: "" }, "filing_status");
    // Walks from filing_status; nothing was truly filled, so it asks filing_status.
    expect(engine.currentStepId).toBe("filing_status");
  });
});

describe("applyExtraction — server-authoritative routing", () => {
  it("honors an out-of-order `next` chosen by the server", () => {
    const engine = atExtractStep();
    // Server decides to jump straight to the contact step.
    engine.applyExtraction({ filing_status: "single" }, "client_contact");
    expect(engine.currentStepId).toBe("client_contact");
  });

  it("falls back to the step's own transitions when next is missing", () => {
    const engine = atExtractStep();
    engine.applyExtraction({ filing_status: "single" });
    // No next given → advance via extracted's transition (→ filing_status),
    // which then skips because filing_status is now filled → dependents.
    expect(engine.currentStepId).toBe("dependents");
  });

  it("falls back when next names an unknown step", () => {
    const engine = atExtractStep();
    engine.applyExtraction({ filing_status: "single" }, "nonexistent");
    expect(engine.currentStepId).toBe("dependents");
  });
});

describe("failExtraction — the reliability guarantee", () => {
  it("advances past the server step with no answers merged", () => {
    const engine = atExtractStep();
    engine.failExtraction();
    // Nothing extracted → the first question is asked normally.
    expect(engine.currentStepId).toBe("filing_status");
    expect(Object.keys(engine.answers)).toEqual(["describe"]);
  });
});

describe("applyExtractResponse — interpreting a raw server reply", () => {
  it("applies a well-formed ok response", () => {
    const engine = atExtractStep();
    const res: ExtractResponse = {
      status: "ok",
      answers: { filing_status: "head_of_household" },
      next: "filing_status",
    };
    engine.applyExtractResponse(res);
    expect(engine.answers.filing_status).toBe("head_of_household");
    expect(engine.currentStepId).toBe("dependents");
  });

  it("treats status:error as a failure and falls back", () => {
    const engine = atExtractStep();
    engine.applyExtractResponse({ status: "error" });
    expect(engine.currentStepId).toBe("filing_status");
    expect("filing_status" in engine.answers).toBe(false);
  });

  it("falls back on null / undefined payloads", () => {
    const e1 = atExtractStep();
    e1.applyExtractResponse(null);
    expect(e1.currentStepId).toBe("filing_status");

    const e2 = atExtractStep();
    e2.applyExtractResponse(undefined);
    expect(e2.currentStepId).toBe("filing_status");
  });

  it("applies a partial response (answers present, no next)", () => {
    const engine = atExtractStep();
    engine.applyExtractResponse({
      status: "partial",
      answers: { filing_status: "single" },
    });
    expect(engine.answers.filing_status).toBe("single");
    expect(engine.currentStepId).toBe("dependents");
  });

  it("tolerates a response missing the answers field", () => {
    const engine = atExtractStep();
    engine.applyExtractResponse({ status: "ok", next: "filing_status" });
    // No answers merged → filing_status asked.
    expect(engine.currentStepId).toBe("filing_status");
  });
});

describe("runExtraction — the fetch round-trip", () => {
  /** A fake fetch returning the given JSON body with the given status. */
  const jsonFetch = (
    body: unknown,
    status = 200,
  ): { fn: typeof fetch; calls: { url: string; init: RequestInit }[] } => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      } as Response;
    }) as unknown as typeof fetch;
    return { fn, calls };
  };

  it("posts to {prefix}/extract with data only — never a prompt", async () => {
    const engine = atExtractStep();
    const { fn, calls } = jsonFetch({
      status: "ok",
      answers: {},
      next: "filing_status",
    });

    await runExtraction(engine, {
      llmPrefix: "https://api.example.com/llm/",
      sessionToken: "tok-123",
      fetchFn: fn,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.example.com/llm/extract"); // trailing slash normalized
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toEqual({
      flow_id: "tax-llm",
      version: "1.0.0",
      verb: "extract",
      step: "extracted",
      answers: { describe: expect.any(String) },
    });
    // No prompt/model/schema leak from client to server.
    expect(body).not.toHaveProperty("prompt");
    expect(body).not.toHaveProperty("llm");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-123");
  });

  it("posts to an exact server verb URL with verb and DSL query parameters", async () => {
    const engine = atExtractStep();
    const { fn, calls } = jsonFetch({
      status: "ok",
      answers: {},
      next: "filing_status",
    });

    await runExtraction(engine, {
      llmUrl: "https://api.example.com/inquirex/llm?site=demo",
      dslUrl: "https://example.com/inquirex/form.json",
      fetchFn: fn,
    });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe(
      "https://api.example.com/inquirex/llm",
    );
    expect(url.searchParams.get("site")).toBe("demo");
    expect(url.searchParams.get("verb")).toBe("extract");
    expect(url.searchParams.get("inquirex_dsl")).toBe(
      "https://example.com/inquirex/form.json",
    );
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.verb).toBe("extract");
    expect(body.step).toBe("extracted");
  });

  it("omits the Authorization header when no token is set", async () => {
    const engine = atExtractStep();
    const { fn, calls } = jsonFetch({
      status: "ok",
      answers: {},
      next: "filing_status",
    });
    await runExtraction(engine, {
      llmPrefix: "https://api.example.com/llm",
      fetchFn: fn,
    });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("merges answers and advances on a 200 ok response", async () => {
    const engine = atExtractStep();
    const { fn } = jsonFetch({
      status: "ok",
      answers: {
        filing_status: "single",
        dependents: 0,
        income_types: ["W2"],
        state_filing: "Texas",
      },
      next: "filing_status",
    });
    await runExtraction(engine, { llmPrefix: "x", fetchFn: fn });
    expect(engine.answers.filing_status).toBe("single");
    expect(engine.currentStepId).toBe("client_contact"); // all four skipped
  });

  it("falls back on a non-2xx response (no answers merged)", async () => {
    const engine = atExtractStep();
    const { fn } = jsonFetch({ error: "boom" }, 500);
    await runExtraction(engine, { llmPrefix: "x", fetchFn: fn });
    expect(engine.currentStepId).toBe("filing_status");
    expect("filing_status" in engine.answers).toBe(false);
  });

  it("falls back when the response body is not valid JSON", async () => {
    const engine = atExtractStep();
    const fn = (async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    })) as unknown as typeof fetch;
    await runExtraction(engine, { llmPrefix: "x", fetchFn: fn });
    expect(engine.currentStepId).toBe("filing_status");
  });

  it("falls back (and aborts) when the request exceeds the timeout", async () => {
    const engine = atExtractStep();
    // A fetch that only rejects once its abort signal fires.
    const hangingFetch = ((_url: string, init: RequestInit) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      })) as unknown as typeof fetch;

    await runExtraction(engine, {
      llmPrefix: "x",
      timeoutMs: 5,
      fetchFn: hangingFetch,
    });
    expect(engine.currentStepId).toBe("filing_status");
  });

  it("falls back immediately when no llmPrefix is configured (no fetch)", async () => {
    const engine = atExtractStep();
    let called = false;
    const fn = (async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;
    await runExtraction(engine, { llmPrefix: "", fetchFn: fn });
    expect(called).toBe(false);
    expect(engine.currentStepId).toBe("filing_status");
  });

  it("is a no-op when the current step is not an extract step", async () => {
    const engine = new FlowEngine(flow()); // sits on `describe` (ask)
    let called = false;
    const fn = (async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;
    await runExtraction(engine, { llmPrefix: "x", fetchFn: fn });
    expect(called).toBe(false);
    expect(engine.currentStepId).toBe("describe");
  });
});

describe("chained extract steps", () => {
  it("a second extract step is reachable after the first resolves", () => {
    const def = flow();
    // Insert a second extract right after the first.
    def.steps.extracted.transitions = [{ to: "second_extract" }];
    def.steps.second_extract = {
      verb: "extract",
      requires_server: true,
      transitions: [{ to: "filing_status" }],
    };
    const engine = atExtractStep(def);

    engine.applyExtraction({}, "second_extract");
    expect(engine.currentStepId).toBe("second_extract");
    expect(engine.currentStepIsExtract).toBe(true);
  });
});
