# inquirex-js

Embeddable copilot-style questionnaire widget. Loads an [Inquirex](https://github.com/flowengine-rb/inquirex) flow definition as JSON, walks users through a branching form inside a floating chat panel, and POSTs collected answers back to the same URL.

**49KB** single-file bundle (14KB gzipped). Zero framework dependencies on the host page. Shadow DOM isolates styles completely.

## Quick Start

Add one script tag to any page:

```html
<script src="https://qualified.at/inquirex.js"
        data-flow-url="https://your-server.com/api/flows/tax-intake">
</script>
```

That's it. A chat bubble appears in the bottom-right corner. Clicking it opens the questionnaire panel.

## How It Works

The `data-flow-url` attribute points to **your server**. The widget uses that single URL for both directions, distinguished by HTTP method:

| Method | Purpose | Content-Type |
|--------|---------|-------------|
| **GET** | Fetch the flow definition JSON | Response: `application/json` |
| **POST** | Submit completed answers | Request: `application/json` |

### GET — Serve the Flow Definition

When the widget loads, it makes a `GET` request to your URL and expects a JSON response matching the [Inquirex wire format](#json-wire-format). In Ruby, this is what `definition.to_json` produces.

### POST — Receive Completed Answers

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

## Attributes

| Attribute | Description |
|-----------|-------------|
| `data-flow-url` | URL for GET (fetch flow) and POST (submit answers) |
| `data-site-id` | Shorthand — expands to `https://qualified.at/api/flows/{site-id}` |
| `data-flow-json` | Inline JSON string (no GET request; POST still uses `data-flow-url` if set) |

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

Steps marked `"requires_server": true` on their transitions will round-trip to the server for evaluation (used by `inquirex-llm` verbs like `clarify` and `summarize`). Pure rule-based branching is evaluated entirely client-side with no network calls.

## Brand Customization

The `meta.brand.color` value from your flow JSON sets the widget's accent color automatically. This controls the bubble, header gradient, answer bubbles, buttons, and focus rings.

## Development

```bash
npm install
npm run dev       # Vite dev server at localhost:3100
npm run build     # Produces dist/inquirex.js (IIFE bundle)
npm run typecheck # TypeScript validation
```

The `index.html` dev harness simulates a host site with the widget embedded, loading `demo/tax-intake.json` as the flow definition.

## License

MIT
