# inquirex-js

Embeddable copilot-style questionnaire widget. Loads an [Inquirex](https://github.com/flowengine-rb/inquirex) flow definition as JSON, walks users through a branching form inside a floating chat panel, and POSTs the collected answers back to your server.

**53KB** single-file bundle (16KB gzipped). Zero framework dependencies on the host page. Shadow DOM isolates styles **and** markup completely, and every value from the flow definition is rendered as text, never HTML — see [Security](#security).

## Three ways to use it

1. **[qualified.at](https://qualified.at) — managed, and by far the easiest.** Design your form in a visual editor, point it at your domain, paste one script tag. The flow JSON, the endpoints, the LLM verbs, the auth token, and the origin lock are all baked into a single minified bundle for you. A free trial gets you live in about ten minutes.
2. **Self-hosted, deterministic (no LLM).** You provide one URL that answers `GET` (returns your flow as JSON) and `POST` (receives the completed answers). Pure branching runs entirely in the browser — no AI, no keys, no per-request cost.
3. **Self-hosted, with LLM verbs.** Add one more endpoint that runs the model with *your own* API key. Verbs like `extract` turn a paragraph of free text into structured answers that pre-fill and skip later questions — a 17-question intake can collapse to 3.

All three render the same widget; they differ only in who hosts the pieces.

### 1. qualified.at (managed)

> [!TIP]
> Register at [qualified.at](https://qualified.at), add your site's domain, author the form, and copy the auto-generated snippet. The library, the form's JSON, the endpoint URLs, the LLM wiring, the auth token, and the origin lock are all compiled into one minified `inquirex-<form-id>.js`. XSS-safe rendering and the domain restriction are automatic — the snippet only runs on the site you registered.
>
> ```html
> <script async
>   src="https://qualified.at/intake/inquirex-97484e00-61e5-013f-3809-66219a96f4e3.js"></script>
> ```

Everything below is what qualified.at does *for* you — read on only if you want to host it yourself.

### 2. Self-hosted — deterministic (no LLM)

The simplest integration. Load the bundle (from npm, your own assets, or a CDN) and give it **one URL on your own domain** that answers two methods:

- **`GET`** → returns the flow definition as JSON (the [wire format](#json-wire-format)).
- **`POST`** → receives the [completed answers](#end-of-the-form-post--receive-completed-answers).

```html
<script src="https://example.com/assets/inquirex.js"
        data-inquirex-url="https://example.com/intake"></script>
```

Pure branching (rules, `skip_if`, accumulators) is evaluated client-side, so no server round-trip happens until the final `POST`. No AI endpoint, no API keys.

#### Authoring the flow: Ruby DSL → JSON

Write the form once in the Inquirex Ruby DSL, then convert it to the JSON the widget consumes with the **`inquirex` CLI** (shipped by the [`inquirex-tty`](https://github.com/flowengine-rb) gem):

```bash
gem install inquirex-tty

# Convert a Ruby DSL file to the JSON wire format the widget loads
inquirex export flow.rb --format json > public/intake.json
```

> The exact subcommand/flags live in the `inquirex-tty` README; the point is that
> `definition.to_json` in Ruby and the `inquirex` CLI both emit the same wire
> format the widget reads. Serve that JSON from your `GET` route — a static file
> is fine — and you're done.

### 3. Self-hosted — with LLM verbs

Add a **second endpoint** for LLM verbs. When the flow reaches an `extract` step, the widget POSTs to it; your backend calls the model with your key and returns structured fields. Add `data-inquirex-llm-url`:

```html
<script src="https://example.com/assets/inquirex.js"
        data-inquirex-url="https://example.com/intake"
        data-inquirex-llm-url="https://example.com/intake/llm"></script>
```

#### What your LLM endpoint must do

The widget calls it like this — note it sends **only data**, never a prompt, model, or schema:

```http
POST https://example.com/intake/llm?verb=extract&dsl=https%3A%2F%2Fexample.com%2Fintake
Content-Type: application/json
Authorization: Bearer <token issued in your GET response>
```

```json
{
  "verb": "extract",
  "flow_id": "tax-intake-2025",
  "version": "1.0.0",
  "step": "extract_business_details",
  "answers": { "describe_your_businesses": "I run two businesses — an influencer channel …" }
}
```

Your endpoint is responsible for:

1. **Authenticating** the request (verify the bearer token + `Origin` — see [Security](#security)).
2. **Resolving the prompt & schema.** Reload your own authoritative flow (by `flow_id`+`version`, or from the `dsl` URL) and look up the server-only `llm` block for `step`. The prompt, model, and expected schema **never leave your server**.
3. **Calling the model** with *your* API key. Wrap the user's text as clearly-delimited untrusted data (prompt-injection hardening) and constrain output to the schema.
4. **Validating** each returned field against the schema; drop anything invalid rather than guessing.
5. **Responding** with the structured answers and the next step:

```json
{
  "status": "ok",
  "answers": { "industry": "Media", "entity_type": "s_corp", "employee_count": 1 },
  "next": "confirm_details"
}
```

`status` is `ok` | `partial` | `error`. The widget merges the returned `answers`
and jumps to `next`; downstream steps guarded by `skip_if: not_empty(field)`
auto-skip for every field you filled.

**Reliability guarantee:** any failure — non-2xx, timeout, `status:error`, bad
JSON, or no `llm-url` configured at all — makes the widget advance and ask those
questions normally. An LLM outage never breaks the form.

The full wire contract, session-token model, and abuse controls are in
**[docs/extract-protocol.md](docs/extract-protocol.md)**; the complete
configuration surface (the `mount()` API, launch, position, theming, the baked
bundle) is in **[docs/embedding.md](docs/embedding.md)**.

## How It Works

The `data-inquirex-url` attribute points to **your server**. By default the widget uses that single URL for both directions, distinguished by HTTP method (add `data-inquirex-submit-to` to POST answers elsewhere):

| Method | Purpose | Content-Type |
|--------|---------|-------------|
| **GET** | Fetch the flow definition JSON | Response: `application/json` |
| **POST** | Submit completed answers | Request: `application/json` |

### GET — Serve the Flow Definition

When the widget loads, it makes a `GET` request to your URL and expects a JSON response matching the [Inquirex wire format](#json-wire-format). In Ruby, this is what `definition.to_json` produces.

### End of the Form: POST — Receive Completed Answers

When the user finishes the questionnaire, the widget POSTs a JSON body:

```json
{
  "flow_id": "tax-intake-2025",
  "version": "1.0.0",
  "answers": {
    "filing_status": "single",
    "dependents": 2,
    "income_types": ["W-2 Employment", "Business"],
    "business_count": 1,
    "estimated_income": 85000,
    "state_filing": "california",
    "additional_info": "I also have crypto income."
  },
  "path_taken": ["filing_status", "dependents", "income_types", "business_count", "estimated_income", "state_filing", "additional_info", "thank_you"],
  "steps_completed": 8,
  "completed_at": "2025-04-13T18:30:00.000Z"
}
```

Your server can store this, email it, push to a spreadsheet, fire a webhook — whatever you need.

If the flow declares [accumulators](#accumulators) (e.g. a `:price` running total), the POST body also includes a `totals` object:

```json
{
  "flow_id": "tax-pricing-2025",
  "answers": { "filing_status": "mfj", "dependents": 3, "schedules": ["c", "e"] },
  "totals":  { "price": 700, "complexity": 4 },
  "path_taken": ["filing_status", "dependents", "schedules", "done"],
  "steps_completed": 4,
  "completed_at": "2025-04-13T18:30:00.000Z"
}
```

## Configuration

Everything below is one `InquirexConfig`, settable four ways. **Every option
works identically** whether you use a script tag, npm, or the hosted bundle.

### The full set

| Script attribute | Config key | Default | Purpose |
|---|---|---|---|
| `data-inquirex-url` | `url` | — | GET the flow DSL JSON. Also the POST target for answers unless `submit-to` is set. Forwarded to LLM verbs as `?dsl=` |
| `data-inquirex-json` | `json` | — | Inline flow JSON string (skips the GET) |
| `data-inquirex-site-id` | `siteId` | — | Shorthand — expands to `https://qualified.at/api/flows/{site-id}` |
| `data-inquirex-submit-to` | `submitUrl` | _inherits `url`_ | POST completed answers here |
| `data-inquirex-llm-url` | `llmUrl` | — | POST endpoint for LLM verbs (`{llm-url}?verb=extract&dsl=…`). Omit to disable LLM steps |
| `data-inquirex-llm-timeout` | `llmTimeout` | `20000` | Client timeout (ms) for one LLM call before falling back |
| `data-inquirex-auth` | `auth` | _flow `session.token`_ | Server-signed bearer token forwarded on every request ([Security](#security)) |
| `data-inquirex-origins` | `origins` | _any_ | Origin allowlist (comma-separated in the attribute; array in config). The widget won't run elsewhere ([Security](#security)) |
| `data-inquirex-trigger` | `trigger` | `click` | How it first opens: `click` \| `auto` \| `delay` |
| `data-inquirex-trigger-delay` | `triggerDelay` | `1000` | ms before auto-open when `trigger="delay"` |
| `data-inquirex-position` | `position` | `bottom-right` | Corner to anchor to: `bottom-right` \| `bottom-left` |
| `data-inquirex-theme` | `theme` | — | [Theme overrides](#theme-keys) (JSON object in the attribute) |

Priority for the definition itself: `json` > `url` > `site-id`.

### 1. Script tag

```html
<script src="https://example.com/assets/inquirex.js"
        data-inquirex-url="https://example.com/intake"
        data-inquirex-submit-to="https://example.com/intake/answers"
        data-inquirex-llm-url="https://example.com/intake/llm"
        data-inquirex-auth="<server-signed token>"
        data-inquirex-origins="https://example.com"
        data-inquirex-trigger="delay"
        data-inquirex-trigger-delay="1000"
        data-inquirex-position="bottom-left"
        data-inquirex-theme='{"headerBg":"#111827","launcherRadius":"12px"}'></script>
```

### 2. npm / ESM

```ts
import { mount } from 'inquirex-js';

mount({
  url: '/api/flows/my-flow',
  llmUrl: '/api/flows/my-flow/llm',
  trigger: 'delay',
  triggerDelay: 1000,
  position: 'bottom-left',
  origins: ['https://example.com'],
  theme: { headerBg: '#111827', highlight: '#f59e0b', launcherRadius: '12px' },
});
```

`mount(config?, target?)` returns the element; `createWidget(config)` builds it
without attaching.

### 3. The custom element directly

Attribute names drop the `data-inquirex-` prefix:

```html
<inquirex-widget url="/api/flows/my-flow" llm-url="/api/flows/my-flow/llm"
                 position="bottom-left" trigger="delay"></inquirex-widget>
```

### 4. Global / baked bundle

Set `window.InquirexConfig = {...}` before the script, or compile the config
into a per-form bundle (what qualified.at does).

### Precedence

Each option resolves from the first source that provides it:

1. an explicit `mount(config)` argument,
1. `data-inquirex-*` attributes on the loading `<script>`,
1. `window.InquirexConfig`,
1. the build-time baked config,
1. built-in defaults.

The `theme` object merges key-by-key under the same rule. Full details — the
baked bundle, the `mount()` API, launch/position — are in
**[docs/embedding.md](docs/embedding.md)**. Visual knobs are under
[Theming](#theming).

## Security

Two threat surfaces matter when you drop third-party JavaScript on a page: can
the widget harm the **host page** (XSS), and can a malicious client abuse **your
backend** (forged/replayed requests, an open LLM proxy on your bill).

### XSS — protecting the host page

- **Shadow DOM isolation.** The widget renders inside its own shadow root, so its
  markup and styles never touch — and are never touched by — the host page's DOM
  or CSS. (Shadow DOM is an *isolation* boundary, not a JS sandbox, but the widget
  runs no host-supplied code.)
- **Every dynamic value is rendered as text, not HTML.** All strings from the flow
  definition — questions, labels, options, `say`/`btw`/`warning` bodies — are
  interpolated through Lit templates, which set them via `textContent` and escape
  attribute bindings. A malicious or compromised flow JSON therefore **cannot
  inject `<script>` or event handlers** into your page. The widget uses no
  `innerHTML`, `eval`, or `Function` on untrusted content. (The only `unsafeHTML`
  is the dev-only debug inspector, tree-shaken out of production builds.)
- **No ambient authority.** The widget reads no cookies, needs no host globals,
  and makes requests only to the URLs you configure.

### Authenticating requests (frontend → backend)

**Hard truth first:** you cannot authenticate *client code* running in a
visitor's browser on a third party's page. Any secret shipped in the bundle is
readable in DevTools, so a SHA computed *in the browser* from a shipped secret
proves nothing — an attacker reads the secret and reproduces the hash. This is
true of every embeddable widget.

The version of your instinct that **does** hold moves the hashing to the server
and binds it to the request's **origin**, which the browser sets and page JS
cannot forge cross-origin:

1. **Mint server-side, on init.** In your `GET` flow response (or at page render),
   compute a short-TTL token and return it in the definition's `session` block:

   ```
   token = HMAC(per_form_secret, origin + form_id + version + exp + nonce)
   ```

   The secret never leaves your server. This is exactly "hash of the origin +
   secret, pre-computed and sent when the component initializes" — done where it
   can't be forged.
2. **Carry, don't compute.** The widget stores the token opaquely and forwards it
   as `Authorization: Bearer <token>` on **every** request — the flow `GET`, the
   answers `POST`, and each LLM `POST`. It computes nothing. (Provide it via
   `data-inquirex-auth`, or return it as `session.token` in the flow JSON.)
3. **Verify on every call, server-side:**
   - recompute the HMAC and constant-time compare → stops forgery;
   - the request's `Origin`/`Referer` header equals the origin bound in the token
     and is on your per-site allowlist → stops cross-site embedding (the browser
     sets `Origin`; page JS can't override it cross-origin);
   - not expired, `nonce`+`step` not already spent (Redis `SET NX`) → stops replay;
   - a per-session LLM-call budget (e.g. max 5) → caps the blast radius and your bill.

| Threat | Defended? |
| --- | --- |
| Random POSTs running free inference on your key | **Yes** — no valid token, no call |
| Huge bodies / many calls / expensive model | **Yes** — body cap + per-session budget |
| Replay of a captured request | **Yes** — one-time `nonce`+`step` |
| Forged / self-minted tokens | **Yes** — server-only HMAC secret |
| Embedding on a non-allowlisted domain | **Mostly** — `Origin` check (bypassable only outside a browser, where budget/rate limits bite) |

### Client-side origin lock (defense-in-depth)

As a cheap first gate you can restrict which origins the embed even runs on:

```html
<script src="https://example.com/assets/inquirex.js"
        data-inquirex-url="https://example.com/intake"
        data-inquirex-origins="https://example.com,https://www.example.com"></script>
```

If the current `location.origin` is not listed, the widget renders nothing and
makes no requests. This stops a copied script tag from working on someone else's
site. It is **not** a security boundary (it runs in the browser and is
defeatable) — it complements, never replaces, the server-side `Origin` check
above. qualified.at's baked bundle sets this automatically.

Full anti-spoofing design (why HMAC not a keypair, when to add a Turnstile
challenge, PII handling) is in
[docs/extract-protocol.md](docs/extract-protocol.md#authenticating-requests-anti-spoofing).

## CORS Setup

Since the widget runs on **your customer's site** (e.g. `example.com`) but fetches from **your API** (e.g. `api.qualified.at`), the browser enforces cross-origin restrictions. Your API server must include CORS headers.

The `GET` request is simple, but the `POST` sends `Content-Type: application/json`, which triggers a **preflight OPTIONS request**. Your server must handle all three: `OPTIONS`, `GET`, and `POST`.

### Required Response Headers

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age: 86400
```

> Use `Access-Control-Allow-Origin: *` to allow any site to embed the widget.
> To restrict to specific domains, replace `*` with the exact origin (e.g. `https://example.com`).
> Note: you cannot use `*` with credentials — if you need cookies or auth tokens,
> you must specify the exact origin and add `Access-Control-Allow-Credentials: true`.

### Nginx

```nginx
location /api/flows/ {
    # Handle preflight
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' '*';
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
        add_header 'Access-Control-Allow-Headers' 'Content-Type';
        add_header 'Access-Control-Max-Age' 86400;
        add_header 'Content-Length' 0;
        return 204;
    }

    add_header 'Access-Control-Allow-Origin' '*';
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
    add_header 'Access-Control-Allow-Headers' 'Content-Type';

    proxy_pass http://upstream;
}
```

### Rails (rack-cors gem)

```ruby
# config/initializers/cors.rb
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins '*'
    resource '/api/flows/*',
      headers: %w[Content-Type],
      methods: %i[get post options]
  end
end
```

### Express (Node.js)

```js
const cors = require('cors');

app.use('/api/flows', cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 86400,
}));
```

### Minimal Server Example

Any HTTP server that responds to GET and POST at the same path works. Here's a minimal Node.js example:

```js
import { readFileSync } from 'fs';
import { createServer } from 'http';

const flow = JSON.parse(readFileSync('tax-intake.json', 'utf8'));

createServer((req, res) => {
  // CORS headers on every response
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(flow));
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const answers = JSON.parse(body);
      console.log('Received answers:', answers);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });
    return;
  }

  res.writeHead(405).end();
}).listen(3000);
```

## JSON Wire Format

The flow definition JSON is produced by the Ruby DSL. Define a flow, then call `to_json`:

```ruby
require "inquirex"

definition = Inquirex.define id: "tax-intake-2025", version: "1.0.0" do
  meta title: "Tax Preparation",
       subtitle: "Let us understand your tax situation",
       brand: { name: "Agentica", color: "#2563eb" }

  start :filing_status

  ask :filing_status do
    type :enum
    question "What is your filing status?"
    options single: "Single", married_jointly: "Married Filing Jointly"
    transition to: :dependents
  end

  ask :dependents do
    type :integer
    question "How many dependents?"
    default 0
    transition to: :income_types
  end

  # ... more steps ...
end

puts definition.to_json
```

That produces the following JSON, which is the structure the widget expects:

```json
{
  "id": "tax-intake-2025",
  "version": "1.0.0",
  "meta": {
    "title": "Tax Preparation",
    "subtitle": "Let us understand your tax situation",
    "brand": { "name": "Agentica", "color": "#2563eb" }
  },
  "start": "filing_status",
  "steps": {
    "filing_status": {
      "verb": "ask",
      "type": "enum",
      "question": "What is your filing status?",
      "options": [
        { "value": "single", "label": "Single" },
        { "value": "married_jointly", "label": "Married Filing Jointly" }
      ],
      "transitions": [
        { "to": "dependents" }
      ],
      "widget": {
        "desktop": { "type": "radio_group" },
        "mobile":  { "type": "dropdown" }
      }
    },
    "dependents": {
      "verb": "ask",
      "type": "integer",
      "question": "How many dependents?",
      "default": 0,
      "transitions": [
        { "to": "income_types" }
      ],
      "widget": {
        "desktop": { "type": "number_input" },
        "mobile":  { "type": "number_input" }
      }
    }
  }
}
```

Note the `"widget"` keys -- these are auto-populated by `WidgetRegistry` defaults when no explicit `widget` hint is set in the DSL. You can override them:

```ruby
ask :filing_status do
  type :enum
  question "What is your filing status?"
  options single: "Single", married_jointly: "Married Filing Jointly"
  widget target: :desktop, type: :radio_group, columns: 2
  widget target: :mobile,  type: :dropdown
  transition to: :dependents
end
```

### Verbs

| Verb | Collects Input | Description |
|------|:-:|---|
| `ask` | Yes | A question with a typed answer |
| `confirm` | Yes | Yes/No boolean gate |
| `say` | No | Informational message |
| `header` | No | Section heading |
| `btw` | No | Sidebar / admonition |
| `warning` | No | Alert message |

### Data Types

| Type | Widget | Description |
|------|--------|-------------|
| `string` | Text input | Single-line text |
| `text` | Textarea | Multi-line text |
| `integer` | Number input | Whole number |
| `decimal` | Number input | Floating point |
| `currency` | Number input ($ prefix) | Monetary amount |
| `boolean` | Yes/No buttons | True/false |
| `enum` | Radio buttons | Single selection |
| `multi_enum` | Checkboxes | Multiple selections |
| `date` | Date input | Calendar date |
| `email` | Email input | Email address |
| `phone` | Phone input | Phone number |

### Conditional Transitions (Rules)

Transitions can include a `rule` object for conditional branching. The widget evaluates these client-side:

```json
{
  "to": "business_details",
  "rule": { "op": "contains", "field": "income_types", "value": "Business" }
}
```

Available operators: `equals`, `contains`, `greater_than`, `less_than`, `not_empty`, `all` (AND), `any` (OR).

### Server-Required Steps

Steps marked `"requires_server": true` round-trip to the server. In v1 this is the `extract` verb (alias `clarify`), which turns a free-text answer into structured fields that pre-fill later questions — see [docs/extract-protocol.md](docs/extract-protocol.md). Pure rule-based branching is evaluated entirely client-side with no network calls.

## Accumulators

Accumulators are **named running totals** the flow maintains as the user answers questions. The canonical use case is **pricing** (totalling the cost of a tax return, a SaaS quote, an insurance premium), but the same primitive works for **complexity scoring**, **credit scoring**, or any other numeric tally.

Like rules, accumulator contributions are **pure data**. The widget evaluates them **entirely client-side** — no network calls, no server round-trips — so the user sees the running total update instantly as they answer each question. The Ruby engine evaluates the same declarations identically, so server and client stay in lockstep.

### Wire format

A flow that uses accumulators adds two things to its JSON:

1. A top-level `accumulators` map declaring each running total.
1. An `accumulate` block on individual steps describing how each answer contributes.

```json
{
  "id": "tax-pricing-2025",
  "start": "filing_status",
  "accumulators": {
    "price":      { "type": "currency", "default": 0 },
    "complexity": { "type": "integer",  "default": 0 }
  },
  "steps": {
    "filing_status": {
      "verb": "ask",
      "type": "enum",
      "options": [
        { "value": "single", "label": "Single" },
        { "value": "mfj",    "label": "Married Filing Jointly" },
        { "value": "hoh",    "label": "Head of Household" }
      ],
      "accumulate": {
        "price":      { "lookup": { "single": 200, "mfj": 400, "hoh": 300 } },
        "complexity": { "lookup": { "mfj": 1 } }
      },
      "transitions": [{ "to": "dependents" }]
    },
    "dependents": {
      "verb": "ask",
      "type": "integer",
      "accumulate": { "price": { "per_unit": 25 } },
      "transitions": [{ "to": "schedules" }]
    },
    "schedules": {
      "verb": "ask",
      "type": "multi_enum",
      "options": [
        { "value": "c", "label": "Schedule C (Business)" },
        { "value": "e", "label": "Schedule E (Rental)" },
        { "value": "d", "label": "Schedule D (Capital Gains)" }
      ],
      "accumulate": {
        "price":      { "per_selection": { "c": 150, "e": 75, "d": 50 } },
        "complexity": { "per_selection": { "c": 2, "e": 1, "d": 1 } }
      },
      "transitions": [{ "to": "done" }]
    }
  }
}
```

### Contribution shapes

Each `accumulate` entry uses exactly one of four shapes:

| Shape | Applies to | Semantics |
|-------|-----------|-----------|
| `lookup: { value: amount, ... }` | `enum` | Adds the amount mapped to the chosen option |
| `per_selection: { value: amount, ... }` | `multi_enum` | Sums the amounts for every selected option |
| `per_unit: N` | `integer`, `decimal`, `currency` | Multiplies the numeric answer by `N` |
| `flat: N` | any type | Adds `N` when the step has a truthy, non-empty answer |

A single step may contribute to any number of accumulators.

### Using the totals in TypeScript

`FlowEngine` exposes totals alongside answers and history:

```ts
import { FlowEngine } from "inquirex-js";

const engine = new FlowEngine(flow);
engine.answer("mfj");     // filing_status → +$400, +1 complexity
engine.answer(3);         // dependents    → +$75
engine.answer(["c", "e"]); // schedules    → +$225, +3 complexity

engine.total("price");     // 700
engine.total("complexity");// 4
engine.totals;             // { price: 700, complexity: 4 }
```

Totals are initialised from each accumulator's `default` and updated synchronously on every `answer()`, so rendering a live price ticker in the widget header is just reading `engine.totals` after each step.

`engine.toResult()` includes a `totals` object, which the widget sends to the server in the POST body on completion.

### `accumulationContribution()` (standalone)

If you need to run the same math outside the engine (e.g. previewing a price inside a summary screen or a custom adapter), the shape evaluator is exported:

```ts
import { accumulationContribution } from "inquirex-js";

accumulationContribution({ lookup: { single: 200, mfj: 400 } }, "mfj");  // 400
accumulationContribution({ per_unit: 25 }, 3);                            // 75
accumulationContribution({ per_selection: { c: 150, e: 75 } }, ["c","e"]);// 225
accumulationContribution({ flat: 10 }, true);                             // 10
```

This function mirrors `Inquirex::Accumulation#contribution` in Ruby one-for-one.

## Theming

The widget's look is driven entirely by CSS custom properties on its shadow root. You can set them from the flow JSON's `theme` object (below), from the embedder config, or straight from your host page's CSS — see the [full variable table in docs/embedding.md](docs/embedding.md#theming), which also covers the header, highlight, bubble, launcher, padding, and radius knobs. Each `theme` key maps 1:1 to a property.

### Minimal — just a brand color

```json
"meta": {
  "title": "Tax Preparation",
  "brand": { "name": "Agentica", "color": "#2563eb" }
}
```

That's all most flows need. The brand color drives the bubble, header gradient, answer bubbles, buttons, and focus rings. The widget **auto-computes** a contrasting text color for anything sitting on top of the brand color, so setting `"color": "#ffffff"` won't produce invisible white-on-white text — it switches to dark text automatically.

### Full theme override

For more control, add a `theme` object alongside `brand`:

```json
"meta": {
  "title": "Midnight Studio",
  "brand": { "name": "Midnight", "color": "#f59e0b" },
  "theme": {
    "background": "#0f172a",
    "surface":    "#1e293b",
    "text":       "#f1f5f9",
    "textMuted":  "#94a3b8",
    "border":     "#334155",
    "radius":     "12px",
    "font":       "'Inter', sans-serif",
    "headerFont": "'Bricolage Grotesque', serif"
  }
}
```

### Theme keys

Every key is optional — omit any and the widget default is used. Each maps 1:1
to a CSS custom property, so the same knob is reachable from the flow JSON, the
embedder config, **or** your host page's CSS.

**Brand & surfaces**

| Key | CSS variable | Default | Controls |
|-----|--------------|---------|----------|
| `brand` | `--iq-brand` | `#2563eb` | Primary accent: header gradient, answer bubbles, buttons, progress bar |
| `onBrand` | `--iq-on-brand` | _auto-computed_ | Text/icon color on top of the brand color (overrides the auto-contrast) |
| `highlight` | `--iq-highlight` | _inherits `brand`_ | Selection/focus accent on the form widgets (radios, checkboxes, inputs) |
| `background` | `--iq-bg` | `#f8f7f4` | Panel body background |
| `surface` | `--iq-surface` | `#ffffff` | Message bubble & input backgrounds |
| `text` | `--iq-text` | `#1c1917` | Primary text |
| `textMuted` | `--iq-text-muted` | `#78716c` | Secondary / placeholder text |
| `border` | `--iq-border` | `#e7e5e4` | Input borders, dividers |

**Header**

| Key | CSS variable | Default | Controls |
|-----|--------------|---------|----------|
| `headerBg` | `--iq-header-bg` | _brand gradient_ | Header background — a solid color or any CSS `background` value |
| `headerText` | `--iq-header-text` | _inherits `onBrand`_ | Header title, subtitle, and button colors |
| `headerFont` | `--iq-header-font` | _inherits `font`_ | Header title font stack |
| `headerFontSize` | `--iq-header-font-size` | `18px` | Header title size |

**Chat bubbles**

| Key | CSS variable | Default | Controls |
|-----|--------------|---------|----------|
| `bubbleQuestionBg` | `--iq-bubble-q-bg` | _inherits `surface`_ | Question bubble background |
| `bubbleQuestionText` | `--iq-bubble-q-text` | _inherits `text`_ | Question bubble text |
| `bubbleAnswerBg` | `--iq-bubble-a-bg` | _inherits `brand`_ | Answer bubble background |
| `bubbleAnswerText` | `--iq-bubble-a-text` | _inherits `onBrand`_ | Answer bubble text |

**Launcher** (the floating button the visitor clicks)

| Key | CSS variable | Default | Controls |
|-----|--------------|---------|----------|
| `launcherBg` | `--iq-launcher-bg` | _inherits `brand`_ | Launcher background |
| `launcherIcon` | `--iq-launcher-icon` | _inherits `onBrand`_ | Launcher icon color |
| `launcherSize` | `--iq-launcher-size` | `60px` | Launcher diameter (the panel repositions to match) |
| `launcherRadius` | `--iq-launcher-radius` | `50%` | Launcher shape — `50%` circle, `12px` squircle, `0` square |

**Geometry & type**

| Key | CSS variable | Default | Controls |
|-----|--------------|---------|----------|
| `panelWidth` | `--iq-panel-width` | `400px` | Panel width |
| `panelMaxHeight` | `--iq-panel-max-height` | `620px` | Panel maximum height |
| `offsetBlock` | `--iq-offset-block` | `24px` | Distance from the bottom edge of the viewport |
| `offsetInline` | `--iq-offset-inline` | `24px` | Distance from the left/right edge (whichever `position` anchors to) |
| `radius` | `--iq-radius` | `18px` | Panel corner radius (`0` for square) |
| `padding` | `--iq-pad` | `16px` | Conversation inner padding |
| `font` | `--iq-font` | `'Outfit', system-ui` | Body font stack |
| `fontSize` | `--iq-font-size` | `15px` | Base font size |

### Escape hatch — raw `--iq-*` properties

Any key starting with `--iq-` is set verbatim, so you can reach a variable that
has no named key yet (e.g. the derived `--iq-brand-dark`) without waiting for a
release:

```json
"theme": {
  "brand": "#7c3aed",
  "--iq-brand-dark": "#4c1d95"
}
```

The same works from the config `theme` object and the `data-inquirex-theme`
attribute. Keys outside the `--iq-` namespace are ignored.

### Setting the theme from your own CSS

Because custom properties inherit through the shadow boundary, you can skip the
theme object entirely and style the widget from the host page:

```css
inquirex-widget {
  --iq-header-bg: #111827;
  --iq-highlight: #f59e0b;
  --iq-launcher-radius: 12px;
  --iq-panel-width: 460px;
  --iq-radius: 0;
}
```

Precedence, lowest to highest: **built-in defaults < your host CSS < config
`theme` / flow `meta.theme`** (the latter land as inline style). Mobile defaults
(below 480px) are applied as *variables*, so an explicit theme still wins there.

### About fonts

The widget **does not load external fonts**. It ships with `Outfit` for its own chrome and assumes that whatever font you specify in `theme.font` / `theme.headerFont` is **already loaded on the embedding page** (that's the usual case — you're only overriding fonts to match your own site's typography, which you already serve). If the font you name isn't available, the widget quietly falls back through this chain:

1. **Your font** (e.g. `'Cairo'`)
1. **Your fallbacks** (e.g. `sans-serif`)
1. **Widget's Outfit** (always loaded by the widget)
1. **System fonts** (`-apple-system`, `BlinkMacSystemFont`)
1. **Browser default `sans-serif`**

So the widget always renders something reasonable. No external requests initiated by the widget for fonts beyond Outfit.

### Authoring themes in Ruby

Most flows are defined in Ruby and serialized with `definition.to_json`. The `inquirex` gem accepts theme keys in **snake_case** (idiomatic Ruby) and automatically converts them to the **camelCase** names the widget consumes:

```ruby
Inquirex.define id: "tax-pricing-2025" do
  meta title: "Tax Preparation Quote",
    brand: { name: "Agentica", logo: "https://cdn.example.com/logo.png" },
    theme: {
      brand:       "#2563eb",
      on_brand:    "#ffffff",
      background:  "#0b1020",
      surface:     "#111827",
      text:        "#f9fafb",
      text_muted:  "#94a3b8",
      border:      "#1f2937",
      radius:      "18px",
      font:        "Inter, system-ui, sans-serif",
      header_font: "Inter, system-ui, sans-serif"
    }
  # ...
end
```

Key translations: `on_brand → onBrand`, `text_muted → textMuted`, `header_font → headerFont`. Everything else passes through unchanged. `brand:` (top-level inside `meta`) is reserved for identity — `name` and `logo`. Colors, fonts, and radii always live under `theme:`.

### Why not let me write raw CSS?

Because the widget lives in Shadow DOM and every internal class name is an implementation detail that could change. Theme keys are a stable contract. This approach also stops you from accidentally breaking layout — every override is a color, a font stack, or a radius, none of which can distort the structure.

If you ever need more knobs, open an issue — we'd rather add another named token than expose selectors.

## Development

This project uses [bun](https://bun.sh) and [just](https://github.com/casey/just). Run `just` to list all recipes.

```bash
just install      # bun install
just dev          # Vite dev server at localhost:3100
just build        # Produces dist/inquirex.js (IIFE) + inquirex.mjs (ESM) + types
just test         # Run the vitest suite
just lint         # Lint with Biome
just format       # Format with Biome
just typecheck    # TypeScript validation
just publish      # Publish the current version to npm
```

The `index.html` dev harness simulates a host site with the widget embedded, loading `demo/tax-intake.json` as the flow definition.

## License

MIT
