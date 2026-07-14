# Inquirex `extract` Protocol (v1)

The wire contract between the **inquirex-js** widget and **your server** for the
one LLM-powered verb that ships in v1: **`extract`**.

`extract` collects unstructured free text in a normal `ask` step, then — in the
very next step — turns that text into structured answers that pre-fill later
questions. Downstream steps carry `skip_if: not_empty(field)`, so any field the
model fills is silently skipped. A 10-question intake collapses to 2.

## Scope: one verb, on purpose

| Verb | v1 | Rationale |
| ----------- | --------- | --------------------------------------------------------------------------------------------- |
| `extract` | **In** | The only verb whose output changes what the user sees next. Mid-flow, blocking. |
| `summarize` | Out | Preparer-facing, never shown to the user. Runs server-side at final POST, not a widget call. |
| `describe` | Out | Structured → text enrichment for the record. Server post-processing. |
| `detour` | v2 | Server returns *new* questions to splice into the flow. Larger protocol; deferred. |

The widget therefore handles exactly one server verb and one endpoint.

> The core gem currently emits `"verb": "clarify"`. The wire verb SHOULD be
> `"extract"`. The widget accepts **both** `extract` and `clarify` as synonyms so
> the JS and Ruby gems need not be released in lockstep.

## Load-bearing decision: server-authoritative

**The prompt, model, temperature, and schema are stripped from the client JSON.**
They are server-only assets, exactly like `compute`/`on_complete` lambdas
([CLAUDE.md — "Lambdas Are Server-Side Only"](../CLAUDE.md)).

The client sends **data, not instructions**. It POSTs the user's answers and a
step id; the server looks up *its own* copy of the prompt/schema by that step id,
runs the model, and returns validated fields.

Why this is non-negotiable: the endpoint is public (CORS `*`, embedded on
customer sites). If the client sent the prompt, anyone could POST
`{"prompt": "...", "model": "opus", "max_tokens": 100000}` and run arbitrary
inference **on your API key, on your bill** — an open LLM proxy. Server-authoritative
closes it.

### What the client-facing step looks like

The full step in the server's definition:

```json
"extracted": {
  "verb": "extract",
  "requires_server": true,
  "transitions": [{ "to": "filing_status", "requires_server": true }],
  "llm": {
    "prompt": "You are a tax-prep intake assistant...",
    "schema": { "filing_status": "string", "dependents": "integer",
                "income_types": "multi_enum", "state_filing": "string" },
    "from_steps": ["describe"],
    "model": "claude_sonnet",
    "temperature": 0.0
  }
}
```

The same step, as served to the browser (`llm` block removed):

```json
"extracted": {
  "verb": "extract",
  "requires_server": true,
  "transitions": [{ "to": "filing_status" }],
  "thinking_label": "Reading your description…"
}
```

The optional `thinking_label` is the only piece of the `llm` block the client
ever sees — a display string for the spinner. Everything else stays server-side.

## The round-trip

### Request — `POST {llm-prefix}/extract`

`{llm-prefix}` comes from the `data-flow-llm-prefix` script attribute.

```http
POST https://api.qualified.at/llm/extract
Content-Type: application/json
```

```json
{
  "flow_id": "tax-preparer-llm-2025",
  "version": "1.0.0",
  "step": "extracted",
  "session_token": "<opaque signed token>",
  "answers": {
    "describe": "We're married, two kids. I have a W-2, my wife freelances (1099), and we sold some stock. California."
  }
}
```

- The client sends **all answers collected so far**; the server selects the
  relevant ones via its own `from_steps`. The client never learns `from_steps`.
- `step` names which server step to resolve. The server ignores any verb the
  client might assert — it reads the verb from its own definition.

### Response — `200 OK`

```json
{
  "step": "extracted",
  "status": "ok",
  "answers": {
    "filing_status": "married_filing_jointly",
    "dependents": 2,
    "income_types": ["W2", "1099", "Investment"],
    "state_filing": "California"
  },
  "next": "filing_status",
  "meta": { "model": "claude_sonnet", "latency_ms": 2100 }
}
```

- `answers` — validated, coerced, **only the fields the model was confident
  about**. Merged into the client's answers hash. Omitted fields → those
  questions get asked normally.
- `next` — the **server-authoritative** next step id. The client jumps there;
  `skip_if` on downstream steps handles the skipping. The server decides routing,
  not the client.
- `status` — `ok` | `partial` (some fields extracted) | `error`.

## Authenticating requests (anti-spoofing)

**Hard truth first: you cannot authenticate the _client code_.** The widget JS
runs in the visitor's browser on a third party's page. Any secret, private key,
or signing routine shipped to the browser is readable by anyone with DevTools, so
JS-side signing proves nothing — an attacker extracts the secret and signs
identical requests. There is no cryptographic way to prove "this came from our
genuine, unmodified widget." This is true of every public embeddable widget.

What you _can_ do is make forgery expensive and cap the blast radius. The secret
stays **server-side**; the JS carries an opaque **bearer token the server signed
itself**.

### Session token (server-signed; the JS never signs)

1. **Mint** on `GET` flow (or `POST {llm-prefix}/session`). Payload binds:
   `{ sid, fid, ver, org: allowed_origin, iat, exp (~15 min), bud: 5 (max extract calls), jti: nonce }`.
1. **Sign** with a **per-form secret** kept server-side. Derive the key as
   `HMAC(master, site_id)` or store a secret per form, so one form can be revoked
   without touching others. Emit as a compact JWT (HS256).
1. **Carry**: the widget stores the token opaquely and sends it as
   `Authorization: Bearer <token>` on every `/extract`. It computes nothing and
   holds no secret.
1. **Verify** on every call, server-side:
   - HMAC signature valid (re-derive per-form key, constant-time compare) → stops
     forgery.
   - Not expired → stops stale replay.
   - `org` equals the request's `Origin` header and is in the per-site allowlist →
     stops cross-site embedding. The browser sets `Origin`; page JS cannot
     override it cross-origin. (`curl` can, but then budget + rate limits bite.)
   - Budget remaining (`DECR sess:{jti}:budget` in Redis, reject at 0) → caps cost.
   - `(jti, step)` not already spent (Redis `SET NX` with TTL) → stops replay of
     the same call and doubles as idempotency.

### Use HMAC, not a keypair

Only the server signs and only the server verifies, so symmetric HMAC-SHA256 is
correct, simpler, and faster. Asymmetric keys matter only when a _third party_
must verify without holding your secret — which never happens in this flow.

### What this does and doesn't stop

| Threat | Defended? |
| ----------------------------------------------------- | ------------------------------------------------------ |
| Open-proxy: random POSTs running free inference | **Yes** — no valid token, no call. |
| Cost amplification: huge bodies, many calls, big model | **Yes** — body cap, per-session budget, chosen model. |
| Replay of a captured request | **Yes** — one-time `jti` + step. |
| Forged / self-minted tokens | **Yes** — server-only HMAC secret. |
| Embedding on a non-allowlisted domain | **Mostly** — `Origin` check (bypassable only outside a browser, where budget/rate limits apply). |
| A real visitor abusing their own budgeted session | **No — bounded, not blocked.** Short TTL + small budget + rate limits keep the blast radius tiny. |

### When abuse gets real

Gate **token minting** behind an invisible **Cloudflare Turnstile / hCaptcha**
challenge and rate-limit minting per IP. That is the only control that meaningfully
answers "is a real browser/human here?" — add it when you see abuse, not before.

## The reliability guarantee

**An LLM failure never blocks the flow — it degrades to a plain form.**

If the server errors, times out, returns `status: "error"`, or the model
hallucinates an invalid enum token that fails validation, the affected fields are
simply absent. `skip_if: not_empty` is then false, and the user is asked those
questions the normal way. The widget MUST treat every failure path as "advance
with no pre-filled answers":

| Situation | Widget behavior |
| ---------------------------------- | ----------------------------------------------------------- |
| `200` with `answers` | Merge answers, advance to `next`. |
| `200` with empty/partial `answers` | Merge what's present, advance; unfilled steps get asked. |
| Non-2xx / `status: "error"` | Advance to the step's transition target, merge nothing. |
| Network error / timeout (20s def.) | Same as error: advance, merge nothing. |

## Widget behavior (normative)

1. On reaching a step whose verb is `extract` (or `clarify`), render the
   `thinking_label` spinner bubble.
1. POST the request above to `{data-flow-llm-prefix}/extract`.
1. Apply a client timeout (default **20 s**, configurable via
   `data-flow-llm-timeout`). Timeout → fallback path.
1. On success, merge `answers` and advance to `next`.
1. On any failure, advance to the first transition target, merging nothing.
1. The widget never sees, sends, or stores a prompt.

## What the server must implement

1. **Definition store.** Resolve `(flow_id, version, step)` to the server-side
   `llm` block (prompt, model, temperature, schema, `from_steps`). A version
   mismatch → `409`; the client should re-fetch the definition.
1. **Session token.** Validate the `session_token` (HMAC/JWT) on every call:
   check signature, `flow_id`, `version`, expiry, and a **per-session LLM-call
   budget** (e.g. max 5). Issue the token in the `GET` flow response as
   `{ "session": { "token", "expires_at", "budget" } }`.
1. **Prompt assembly.** Build the prompt server-side. Wrap the user's text as
   clearly-delimited **untrusted data**, not instructions (prompt-injection
   hardening). Constrain the model with structured output / JSON mode bound to
   the step's `schema`.
1. **Output validation.** Coerce and validate each field against the schema —
   enum/`multi_enum` tokens must match the allowed option values exactly,
   `integer`/`currency` must parse. **Drop invalid fields** rather than guessing;
   the flow will ask for them.
1. **Routing.** Compute `next` from the server's own transitions. Never trust a
   client-supplied next step.
1. **Abuse controls.** Per-site and per-session rate limits (Redis buckets); cap
   request body size (e.g. reject > 8 KB of free text); idempotency on
   `(session_token, step)` so retries don't double-bill.
1. **Data handling.** TLS only. This is tax data — redact PII in logs, never log
   raw prompts with user content, optionally scrub before sending upstream.

### CORS

The `extract` endpoint needs the same CORS treatment as the flow endpoint
(preflight `OPTIONS`, `Access-Control-Allow-Headers: Content-Type`). See the
[README CORS section](../README.md#cors-setup).

## Worked example (flow `09_tax_preparer_llm`)

```
describe  (ask, text)   → user types a paragraph
extracted (extract)     → POST /llm/extract → server fills 4 fields, next = filing_status
filing_status (ask)     → skip_if not_empty(filing_status)  → SKIPPED
dependents    (ask)     → skip_if not_empty(dependents)     → SKIPPED
income_types  (ask)     → skip_if not_empty(income_types)   → SKIPPED
state_filing  (ask)     → skip_if not_empty(state_filing)   → SKIPPED
client_contact (ask)    → asked (never extractable)
```

Five questions become one paragraph plus a contact field. If the extract call
fails, the same flow simply asks all five — no error, no dead end.

## Script tag

```html
<script src="https://qualified.at/inquirex.js"
        data-flow-url="https://api.qualified.at/flows/tax-intake"
        data-flow-llm-prefix="https://api.qualified.at/llm"></script>
```

`data-flow-url` handles `GET` (definition, including the session token) and the
final `POST` (answers). `data-flow-llm-prefix` handles the mid-flow
`POST /extract`. If `data-flow-llm-prefix` is absent, the widget treats every
`extract` step as an immediate fallback (advance, merge nothing) — the flow still
works as a plain form.

## Candidate verbs (v1.1 / v2)

Two axes place a verb. **Does its output change what the user sees next?** If not,
it is server-only post-processing, invisible to the widget. And **is it a graph
node or an affordance bolted onto an existing step?**

### Widget verbs (nodes that advance the flow)

- **`suggest`** _(v1.1)_ — the same extraction as `extract`, but values come back
  **pre-filled and editable** instead of silently skipping the questions. Same
  endpoint; the client renders extracted answers as editable defaults. Safer than
  a silent skip for high-stakes fields (filing status, revenue).
- **`detour`** _(v2)_ — the model authors **new** questions not in the form and
  splices them in. Response carries `{ steps, insert_after, next }`. Needs a hard
  cap (≤ 5 generated questions, no nested LLM) and client-renderable types only.
- **`review`** _(v2)_ — a semantic sanity-check that loops back when answers
  contradict ("you said 'business' but picked no income types"). Catches what
  rules cannot express.

### Affordance verbs (bolted onto an existing `ask`)

- **`explain`** _(v1.1)_ — the model elaborates a question or term for a confused
  user, on demand. Display-only: it never merges answers or changes routing.
  **Most of the value needs no runtime LLM:** an explanation of the _question_
  ("what is head-of-household?") is identical for everyone, so pre-bake it at
  flow-publish time into a static `help_text` field and ship it — zero latency,
  zero abuse surface. Only an explanation contextual to _this user's_ answer needs
  a live `POST /explain` (display-only, session budget applies).

### Server-only (never a widget round-trip)

`qualify` / `score` (lead scoring — the commercial verb), `summarize`,
`describe`, `flag` / `triage`, `redact`. All run on the final answers server-side.

## Deferred to v2

- **`detour`** — server returns new `StepDefinition`s to splice into the running
  flow. Requires a response shape carrying `steps` plus insertion semantics, and
  a guard against unbounded/recursive generation.
- **Streaming** — SSE for progressive "thinking" on slow extractions. v1 is a
  single request/response with a spinner and timeout.
