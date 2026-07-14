import type { FlowEngine } from "./engine.js";

/** Configuration for a single `extract` round-trip. */
export interface ExtractConfig {
  /** Exact endpoint for server-side verbs. The request goes here as-is, with
   *  `verb` and the DSL URL appended as query parameters. Preferred for new
   *  embeds because one endpoint can handle `extract`, `classify`, etc. */
  llmUrl?: string;
  /** Legacy URL prefix; the request goes to `{llmPrefix}/extract`. */
  llmPrefix?: string;
  /** URL the widget used to fetch the source DSL. Sent as a query parameter
   *  with `llmUrl` so the backend can reload the canonical definition. */
  dslUrl?: string;
  /** Query parameter name used for `dslUrl`. */
  dslUrlParam?: string;
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
  const requestUrl = buildServerVerbUrl(engine.currentStep.verb, cfg);
  if (!requestUrl) {
    engine.failExtraction();
    return;
  }

  const stepId = engine.currentStepId;
  const doFetch = cfg.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 20000);

  try {
    const res = await doFetch(requestUrl, {
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
        verb: engine.currentStep.verb,
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

function buildServerVerbUrl(
  verb: string,
  cfg: ExtractConfig,
): string | null {
  if (cfg.llmUrl) {
    const base =
      typeof globalThis.location === "object" && globalThis.location?.href
        ? globalThis.location.href
        : "http://localhost/";
    const url = new URL(cfg.llmUrl, base);
    url.searchParams.set("verb", verb);
    if (cfg.dslUrl) {
      url.searchParams.set(cfg.dslUrlParam ?? "inquirex_dsl", cfg.dslUrl);
    }
    return url.toString();
  }

  if (cfg.llmPrefix) {
    return `${cfg.llmPrefix.replace(/\/+$/, "")}/extract`;
  }

  return null;
}
