import type { FlowEngine } from "./engine.js";

/** Configuration for a single `extract` round-trip. */
export interface ExtractConfig {
  /** URL prefix; the request goes to `{llmPrefix}/extract`. */
  llmPrefix: string;
  /** Opaque server-issued session token, sent as a bearer credential. */
  sessionToken?: string;
  /** Client timeout in ms before aborting and falling back. */
  timeoutMs?: number;
  /** Injectable fetch (defaults to the global). Used by tests. */
  fetchFn?: typeof fetch;
}

/**
 * Perform ONE `extract` round-trip for the engine's current step and apply the
 * result, advancing the engine exactly once. DOM-free and framework-free so it
 * can be unit-tested directly.
 *
 * Every failure path degrades to {@link FlowEngine.failExtraction}: no endpoint
 * configured, non-2xx, timeout, network error, or malformed JSON. The flow never
 * breaks on an LLM failure — it advances and the questions are simply asked.
 *
 * The request carries only data (flow id, version, step id, answers-so-far) plus
 * the bearer token. It never sends a prompt, model, or schema — those are
 * server-only (see docs/extract-protocol.md).
 */
export async function runExtraction(
  engine: FlowEngine,
  cfg: ExtractConfig,
): Promise<void> {
  if (!engine.currentStepIsExtract) return;

  // No endpoint configured → immediate graceful fallback.
  if (!cfg.llmPrefix) {
    engine.failExtraction();
    return;
  }

  const stepId = engine.currentStepId;
  const doFetch = cfg.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 20000);

  try {
    const res = await doFetch(`${cfg.llmPrefix.replace(/\/+$/, "")}/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.sessionToken
          ? { Authorization: `Bearer ${cfg.sessionToken}` }
          : {}),
      },
      body: JSON.stringify({
        flow_id: engine.definition.id,
        version: engine.definition.version,
        step: stepId,
        answers: { ...engine.answers },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    engine.applyExtractResponse(await res.json());
  } catch {
    engine.failExtraction();
  } finally {
    clearTimeout(timer);
  }
}
