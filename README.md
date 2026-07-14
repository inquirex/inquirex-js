# inquirex-js

Embeddable copilot-style questionnaire widget. Loads an [Inquirex](https://github.com/flowengine-rb/inquirex) flow definition as JSON, walks users through a branching form inside a floating chat panel, and POSTs collected answers to your server.

**52KB** single-file browser bundle (about 16KB gzipped). Zero framework dependencies on the host page. Shadow DOM isolates styles completely.

## Quick Start

There are two common ways to use `inquirex-js`:

1. **Use Qualified.at.** Qualified.at generates the flow, endpoint URLs, LLM wiring, domain restrictions, and a minified script snippet for you.
1. **Self-host it.** Install the NPM package or serve the browser bundle yourself, then provide URLs for the Flow DSL, completed-answer submission, and optional LLM/server verbs.

### Qualified.at Hosted Embed

Qualified.at can generate a single minified script per form. In that mode the flow JSON, submit URL, LLM URL, launch behavior, position, and theme are baked into the generated file:

```html
<script async
  src="https://qualified.at/intake/inquirex-tax-preparer-2025.js">
</script>
```

That is the lowest-effort production path. The snippet is tied to the site you configured in Qualified.at, and LLM verbs such as `extract` are handled by the platform backend so your AI API keys never touch the browser.

### Self-Hosted Embed Without LLM

If you only need deterministic branching, provide a DSL URL and a submit URL:

```html
<script src="https://example.com/assets/inquirex.js"
        data-inquirex-dsl="https://example.com/inquirex/form.json"
        data-inquirex-submit-to="https://example.com/inquirex"></script>
```

That's it. A chat bubble appears in the bottom-right corner. Clicking it opens the questionnaire panel.

### Self-Hosted Embed With LLM Verbs

To support `extract` or future server-side verbs, add `data-inquirex-llm-url`.
The browser still sends only data; your backend loads the canonical DSL, owns the prompt/schema/model, calls the LLM, validates output, and returns structured answers.

```html
<script src="https://example.com/assets/inquirex.js"
        data-inquirex-dsl="https://example.com/inquirex/form.json"
        data-inquirex-submit-to="https://example.com/inquirex"
        data-inquirex-llm-url="https://example.com/inquirex/llm"
        data-inquirex-launch="delay"
        data-inquirex-open-delay="1000"
        data-inquirex-position="bottom-right"
        data-inquirex-theme='{"brand":"#2563eb","headerBackground":"#111827","headerText":"#ffffff"}'></script>
```

The widget sends only **data** — flow id, step id, answers-so-far, and a bearer
session token. Prompts, models, and schemas stay server-side. See
[docs/extract-protocol.md](docs/extract-protocol.md) for the full wire contract
and the anti-spoofing design.

## How It Works

The new script-tag API separates the three URLs instead of pretending one endpoint should do every job:

| Attribute | Method | Purpose |
|-----------|--------|---------|
| `data-inquirex-dsl` | `GET` | Fetch the Flow DSL JSON |
| `data-inquirex-submit-to` | `POST` | Submit the completed answer payload |
| `data-inquirex-llm-url` | `POST` | Optional server/LLM verb endpoint |

For backward compatibility, `data-flow-url` still works as a combined GET/POST URL, and `data-flow-llm-prefix` still posts `extract` requests to `{prefix}/extract`.

### GET — Serve the Flow Definition

When the widget loads, it makes a `GET` request to `data-inquirex-dsl` and expects a JSON response matching the [Inquirex wire format](#json-wire-format). In Ruby, this is what `definition.to_json` produces.

### End of the Form: POST — Receive Completed Answers

When the user finishes the questionnaire, the widget POSTs a JSON body to `data-inquirex-submit-to`:

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

### Server/LLM Verb POST

When the flow reaches an `extract` step and `data-inquirex-llm-url` is configured, the widget calls:

```http
POST https://example.com/inquirex/llm?verb=extract&inquirex_dsl=https%3A%2F%2Fexample.com%2Finquirex%2Fform.json
Content-Type: application/json
```

```json
{
  "flow_id": "tax-preparer-2025",
  "version": "2.0.0",
  "verb": "extract",
  "step": "extract_business_details",
  "answers": {
    "describe_your_businesses": "I have two businesses..."
  }
}
```

Your server routes by `verb`, reloads the canonical DSL from `inquirex_dsl`, decides what prompt/schema/model apply to `step`, and returns validated fields. If the call fails or times out, the widget falls back to asking the remaining questions normally.

## Script Attributes

| Attribute | Description |
|-----------|-------------|
| `data-inquirex-dsl` | URL for fetching the Flow DSL JSON |
| `data-inquirex-submit-to` | URL for posting the completed answer payload. Defaults to the DSL URL when omitted |
| `data-inquirex-llm-url` | Exact endpoint for server/LLM verbs such as `extract` |
| `data-inquirex-llm-timeout` | Client timeout in ms for a server verb call before falling back. Default: `20000` |
| `data-inquirex-flow-json` | Inline JSON string for the flow definition. Avoids the DSL `GET` |
| `data-inquirex-launch` | `click`, `open`, or `delay`. Default: `click` |
| `data-inquirex-open-delay` | Delay in ms for `data-inquirex-launch="delay"`. Default: `1000` |
| `data-inquirex-position` | `bottom-right` or `bottom-left`. Default: `bottom-right` |
| `data-inquirex-theme` | JSON object of theme keys or raw `--iq-*` custom properties |
| `data-site-id` | Qualified.at shorthand; expands to `https://qualified.at/api/flows/{site-id}` |

Legacy aliases remain supported:

| Legacy attribute | New equivalent |
|------------------|----------------|
| `data-flow-url` | `data-inquirex-dsl` plus default submit URL |
| `data-flow-json` | `data-inquirex-flow-json` |
| `data-flow-llm-url` | `data-inquirex-llm-url` |
| `data-flow-llm-prefix` | Legacy `{prefix}/extract` endpoint mode |
| `data-flow-llm-timeout` | `data-inquirex-llm-timeout` |

Priority for the definition source: `data-inquirex-flow-json` > `data-inquirex-dsl` / `data-flow-url` > `data-site-id`.

## NPM Usage

Install the package and import it from your application bundle:

```bash
npm install inquirex-js
```

```ts
import "inquirex-js";
```

The package publishes both modern ESM and a browser IIFE:

| Build | Use case |
|-------|----------|
| `dist/inquirex.mjs` | ESM import from build tools |
| `dist/inquirex.js` | `<script src="...">` / CDN usage |

Importing either build registers `<inquirex-widget>`.

### Programmatic Usage

In a bundled app, import the package once and create the element directly:

```ts
import "inquirex-js";

const widget = document.createElement("inquirex-widget");
widget.setAttribute("flow-url", "/inquirex/form.json");
widget.setAttribute("submit-url", "/inquirex");
widget.setAttribute("flow-llm-url", "/inquirex/llm");
widget.setAttribute("launch-mode", "click");
widget.setAttribute("position", "bottom-left");
widget.style.setProperty("--iq-header-bg", "#111827");
widget.style.setProperty("--iq-header-text", "#ffffff");
document.body.appendChild(widget);
```

Or, after the browser bundle has loaded, write the custom element in HTML:

```html
<inquirex-widget
  flow-url="/inquirex/form.json"
  submit-url="/inquirex"
  flow-llm-url="/inquirex/llm"
  launch-mode="click"
  position="bottom-left"
  style="--iq-header-bg:#111827; --iq-header-text:#fff;">
</inquirex-widget>
```

## CORS Setup

Since the widget runs on **your customer's site** (e.g. `example.com`) but fetches from **your API** (e.g. `api.qualified.at`), the browser enforces cross-origin restrictions. Your API server must include CORS headers.

The `GET` request is simple, but the `POST` requests send `Content-Type: application/json` and may send `Authorization: Bearer ...` for server/LLM verbs. That triggers a **preflight OPTIONS request**. Your server must handle `OPTIONS`, `GET`, and `POST` for the DSL and submit endpoints, plus `OPTIONS` and `POST` for the LLM endpoint.

### Required Response Headers

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
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
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization';
        add_header 'Access-Control-Max-Age' 86400;
        add_header 'Content-Length' 0;
        return 204;
    }

    add_header 'Access-Control-Allow-Origin' '*';
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
    add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization';

    proxy_pass http://upstream;
}

location /api/inquirex/llm {
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' '*';
        add_header 'Access-Control-Allow-Methods' 'POST, OPTIONS';
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization';
        add_header 'Access-Control-Max-Age' 86400;
        add_header 'Content-Length' 0;
        return 204;
    }

    add_header 'Access-Control-Allow-Origin' '*';
    add_header 'Access-Control-Allow-Methods' 'POST, OPTIONS';
    add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization';

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
      headers: %w[Content-Type Authorization],
      methods: %i[get post options]
    resource '/api/inquirex/llm',
      headers: %w[Content-Type Authorization],
      methods: %i[post options]
  end
end
```

### Express (Node.js)

```js
const cors = require('cors');

app.use('/api/flows', cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

app.use('/api/inquirex/llm', cors({
  origin: '*',
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
| `extract` | No | Server/LLM verb that turns previous free text into structured answers |
| `clarify` | No | Backward-compatible alias for `extract` |

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

The widget's look is driven by CSS custom properties on the custom element. You can set them three ways:

1. Add `meta.theme` to the flow JSON.
1. Pass `data-inquirex-theme` on the script tag.
1. Set raw `--iq-*` variables on `<inquirex-widget>`.

### Minimal — just a brand color

```json
"meta": {
  "title": "Tax Preparation",
  "brand": { "name": "Agentica" },
  "theme": { "brand": "#2563eb" }
}
```

That's all most flows need. The brand color drives the bubble, header gradient, answer bubbles, buttons, and focus rings. The widget **auto-computes** a contrasting text color for anything sitting on top of the brand color, so setting `"color": "#ffffff"` won't produce invisible white-on-white text — it switches to dark text automatically.

### Full theme override

For more control, add a `theme` object alongside `brand`:

```json
"meta": {
  "title": "Midnight Studio",
  "brand": { "name": "Midnight" },
  "theme": {
    "brand":      "#f59e0b",
    "highlight":  "#22c55e",
    "background": "#0f172a",
    "surface":    "#1e293b",
    "text":       "#f1f5f9",
    "textMuted":  "#94a3b8",
    "border":     "#334155",
    "radius":     "12px",
    "font":       "'Inter', sans-serif",
    "fontSize":   "15px",
    "headerFont": "'Bricolage Grotesque', serif",
    "headerFontSize": "18px",
    "headerBackground": "#111827",
    "headerText": "#ffffff",
    "questionBubbleBackground": "#ffffff",
    "questionBubbleText": "#111827",
    "answerBubbleBackground": "#2563eb",
    "answerBubbleText": "#ffffff",
    "padding": "16px",
    "triggerBackground": "#2563eb",
    "triggerText": "#ffffff",
    "triggerRadius": "50%"
  }
}
```

### Theme keys

Every key is optional — omit any and the widget default is used.

| Key | CSS variable | Default | Controls |
|-----|--------------|---------|----------|
| `brand` | `--iq-brand` | `#2563eb` | Primary brand color |
| `highlight` | `--iq-highlight` | `var(--iq-brand)` | Focus rings, selected controls, progress accents |
| `onBrand` | `--iq-on-brand` | _auto-computed_ | Text/icon color on top of the brand color (override the auto-contrast) |
| `background` | `--iq-bg` | `#f8f7f4` | Panel body background |
| `surface` | `--iq-surface` | `#ffffff` | Message bubble & input backgrounds |
| `text` | `--iq-text` | `#1c1917` | Primary text |
| `textMuted` | `--iq-text-muted` | `#78716c` | Secondary / placeholder text |
| `border` | `--iq-border` | `#e7e5e4` | Input borders, dividers |
| `radius` | `--iq-radius` | `18px` | Panel corner radius |
| `font` | `--iq-font` | `'Outfit', system-ui` | Body font stack |
| `fontSize` | `--iq-font-size` | `15px` | Base widget font size |
| `headerFont` | `--iq-header-font` | _inherits from `font`_ | Header title font stack |
| `headerFontSize` | `--iq-header-font-size` | `18px` | Header title size |
| `headerBackground` | `--iq-header-bg` | Brand gradient | Header background color or gradient |
| `headerText` | `--iq-header-text` | `var(--iq-on-brand)` | Header text and icon color |
| `questionBubbleBackground` | `--iq-question-bg` | `var(--iq-surface)` | Question bubble background |
| `questionBubbleText` | `--iq-question-text` | `var(--iq-text)` | Question bubble text color |
| `answerBubbleBackground` | `--iq-answer-bg` | `var(--iq-brand)` | Answer bubble and primary button background |
| `answerBubbleText` | `--iq-answer-text` | `var(--iq-on-brand)` | Answer bubble and primary button text |
| `padding` | `--iq-padding` | `16px` | Conversation area padding |
| `triggerBackground` | `--iq-trigger-bg` | `var(--iq-brand)` | Floating launcher background |
| `triggerText` | `--iq-trigger-text` | `var(--iq-on-brand)` | Floating launcher icon color |
| `triggerRadius` | `--iq-trigger-radius` | `50%` | Floating launcher corner radius |

Advanced script-tag themes may also set raw `--iq-*` variables, including `--iq-panel-width`, `--iq-panel-max-height`, `--iq-trigger-size`, `--iq-widget-offset-block`, and `--iq-widget-offset-inline`.

### About fonts

The widget loads its default `Outfit` font for its own chrome. Whatever font you specify in `theme.font` / `theme.headerFont` should already be loaded on the embedding page. If the font you name isn't available, the widget quietly falls back through this chain:

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
      font_size:   "15px",
      header_font: "Inter, system-ui, sans-serif",
      header_font_size: "18px",
      header_background: "#111827",
      header_text: "#ffffff",
      question_bubble_background: "#ffffff",
      question_bubble_text: "#111827",
      answer_bubble_background: "#2563eb",
      answer_bubble_text: "#ffffff",
      padding: "16px",
      trigger_background: "#2563eb",
      trigger_text: "#ffffff",
      trigger_radius: "50%"
    }
  # ...
end
```

Key translations include `on_brand → onBrand`, `text_muted → textMuted`, `font_size → fontSize`, `header_font → headerFont`, `header_background → headerBackground`, and `answer_bubble_background → answerBubbleBackground`. `brand:` (top-level inside `meta`) is reserved for identity — `name` and `logo`. Colors, fonts, spacing, and radii live under `theme:`.

### Why not let me write raw CSS?

Because the widget lives in Shadow DOM and every internal class name is an implementation detail that could change. Theme keys are a stable contract. This approach also stops you from accidentally breaking layout — the named overrides are limited to stable colors, fonts, spacing, radii, and fixed widget dimensions.

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
