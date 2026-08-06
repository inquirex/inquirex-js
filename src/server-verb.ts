import type { FlowEngine } from "./engine.js";

/** Configuration for a single server-verb round-trip. */
export interface ServerVerbConfig {
  /** Endpoint that handles LLM verbs. The verb and DSL source are appended as
   *  query params: `{llmUrl}?verb=extract&dsl={dslUrl}`. */
  llmUrl: string;
  /** URL the flow definition was loaded from, forwarded as `?dsl=` so the
   *  server can reload its own authoritative copy. Optional. */
  dslUrl?: string;
  /** Opaque server-signed token, sent as `Authorization: Bearer <token>`. */
  auth?: string;
  /** Client timeout in ms before aborting and falling back. */
  timeoutMs?: number;
  /** Injectable fetch (defaults to the global). Used by tests. */
  fetchFn?: typeof fetch;
}

/**
 * Perform ONE server-verb round-trip for the engine's current step and apply
 * the result, advancing the engine exactly once. DOM-free and framework-free so
 * it can be unit-tested directly.
 *
 * The verb (`extract`, its `clarify` alias, or `summarize`; `describe`/`detour`
 * later) is read from the engine's current step and sent both as a `?verb=`
 * query param — so the server can route without parsing the body — and in the
 * body as the source of truth. A single configurable `llmUrl` handles every
 * verb; there is no per-verb path.
 *
 * Every failure path degrades: no endpoint configured, non-2xx, timeout,
 * network error, or malformed JSON. `extract` falls back to
 * {@link FlowEngine.failExtraction} and the questions are simply asked;
 * `summarize` falls back to {@link FlowEngine.failSummary} and the widget
 * shows its ordinary completion screen. The flow never breaks on an LLM
 * failure.
 *
 * The request carries only data (verb, flow id, version, step id, answers-so-far)
 * plus the bearer token. It never sends a prompt, model, or schema — those are
 * server-only (see docs/extract-protocol.md).
 */
export async function runServerVerb(
  engine: FlowEngine,
  cfg: ServerVerbConfig,
): Promise<void> {
  if (!engine.currentStepIsServerVerb) return;

  // Which failure path this verb degrades to. `extract` advances and the
  // questions get asked normally; `summarize` finishes with no summary, so
  // the widget shows its ordinary completion screen. Neither ever blocks.
  const isSummarize = engine.currentStepIsSummarize;
  const degrade = () =>
    isSummarize ? engine.failSummary() : engine.failExtraction();

  // No endpoint configured → immediate graceful fallback.
  if (!cfg.llmUrl) {
    degrade();
    return;
  }

  const stepId = engine.currentStepId;
  const verb = engine.currentStep.verb;
  const doFetch = cfg.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 20000);

  try {
    const res = await doFetch(buildUrl(cfg.llmUrl, verb, cfg.dslUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.auth ? { Authorization: `Bearer ${cfg.auth}` } : {}),
      },
      body: JSON.stringify({
        verb,
        flow_id: engine.definition.id,
        version: engine.definition.version,
        step: stepId,
        answers: { ...engine.answers },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (isSummarize) {
      engine.applySummaryResponse(body);
    } else {
      engine.applyExtractResponse(body);
    }
  } catch {
    degrade();
  } finally {
    clearTimeout(timer);
  }
}

/** Compose `{llmUrl}?verb=…&dsl=…`, preserving any existing query string. */
function buildUrl(llmUrl: string, verb: string, dslUrl?: string): string {
  const sep = llmUrl.includes("?") ? "&" : "?";
  const params = new URLSearchParams({ verb });
  if (dslUrl) params.set("dsl", dslUrl);
  return `${llmUrl}${sep}${params.toString()}`;
}
