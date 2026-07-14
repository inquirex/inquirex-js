# inquirex-js

Embeddable copilot-style questionnaire widget. Loads an [Inquirex](https://github.com/flowengine-rb/inquirex) flow definition as JSON, walks users through a branching form inside a floating chat panel, and POSTs collected answers back to the same URL.

**49KB** single-file bundle (14KB gzipped). Zero framework dependencies on the host page. Shadow DOM isolates styles completely.

## Quick Start

Add one script tag to any page:

```html
<script src="https://qualified.at/inquirex.js"
        data-flow-url="https://your-server.com/api/flows/tax-intake"
        data-flow-llm-prefix="https://your-server.com/api/llm"></script>
```

That's it. A chat bubble appears in the bottom-right corner. Clicking it opens the questionnaire panel.

- **`data-flow-url`** — the widget `GET`s the flow definition here and `POST`s the
  final answers back to the same URL.
- **`data-flow-llm-prefix`** — optional. Where `extract` steps round-trip
  mid-flow: the widget `POST`s to `{prefix}/extract` and gets back structured
  answers that pre-fill (and skip) later questions. Omit it and `extract` steps
  degrade to a plain form.

The widget sends only **data** — flow id, step id, answers-so-far, and a bearer
session token. Prompts, models, and schemas stay server-side. See
[docs/extract-protocol.md](docs/extract-protocol.md) for the full wire contract
and the anti-spoofing design.

## How It Works

The `data-flow-url` attribute points to **your server**. The widget uses that single URL for both directions, distinguished by HTTP method:

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

## Attributes

| Attribute | Description |
|-----------|-------------|
| `data-flow-url` | URL for GET (fetch flow) and POST (submit answers) |
| `data-site-id` | Shorthand — expands to `https://qualified.at/api/flows/{site-id}` |
| `data-flow-json` | Inline JSON string (no GET request; POST still uses `data-flow-url` if set) |
| `data-flow-llm-prefix` | URL prefix for `extract` round-trips (`POST {prefix}/extract`). Omit to disable LLM steps |
| `data-flow-llm-timeout` | Client timeout in ms for an `extract` call before falling back (default `20000`) |

Priority: `data-flow-json` (for the definition) > `data-flow-url` > `data-site-id`.

### Programmatic Usage

You can also create the widget element directly:

```html
<script type="module">
  import 'https://qualified.at/inquirex.js';

  const widget = document.createElement('inquirex-widget');
  widget.setAttribute('flow-url', '/api/flows/my-flow');
  document.body.appendChild(widget);
</script>
```

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

The widget's look is driven entirely by CSS custom properties on its shadow root. You don't touch CSS directly — you pass a `theme` object in the flow JSON and each key maps 1:1 to a property.

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

Every key is optional — omit any and the widget default is used.

| Key | CSS variable | Default | Controls |
|-----|--------------|---------|----------|
| `brand` | `--iq-brand` | `#2563eb` | Bubble, header gradient, answer bubbles, buttons, progress bar |
| `onBrand` | `--iq-on-brand` | _auto-computed_ | Text/icon color on top of the brand color (override the auto-contrast) |
| `background` | `--iq-bg` | `#f8f7f4` | Panel body background |
| `surface` | `--iq-surface` | `#ffffff` | Message bubble & input backgrounds |
| `text` | `--iq-text` | `#1c1917` | Primary text |
| `textMuted` | `--iq-text-muted` | `#78716c` | Secondary / placeholder text |
| `border` | `--iq-border` | `#e7e5e4` | Input borders, dividers |
| `radius` | `--iq-radius` | `18px` | Panel corner radius |
| `font` | `--iq-font` | `'Outfit', system-ui` | Body font stack |
| `headerFont` | `--iq-header-font` | _inherits from `font`_ | Header title font stack |

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
