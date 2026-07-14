# Inquirex Embed API

Inquirex ships two familiar browser surfaces:

1. A custom element for npm/application users.
2. A self-initializing IIFE bundle for script-tag/CDN users.

The custom element is the stable primitive. The script-tag API is a thin
adapter that creates one `<inquirex-widget>` and maps `data-*` attributes onto
element attributes.

## Recommended NPM Package Shape

Publish both builds from the same package:

```json
{
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/inquirex.mjs",
      "default": "./dist/inquirex.mjs"
    },
    "./inquirex.js": "./dist/inquirex.js"
  },
  "unpkg": "dist/inquirex.js",
  "jsdelivr": "dist/inquirex.js"
}
```

- `dist/inquirex.mjs` is for `import "inquirex-js"` in modern build systems.
- `dist/inquirex.js` is an IIFE for `<script src="...">` embedding.
- Importing either build registers `<inquirex-widget>`.

This keeps the API familiar to the JS crowd: npm users get ESM and TypeScript
types, while non-build-step users get one script tag.

## Script Tag

```html
<script src="/assets/inquirex.js"
        data-inquirex-dsl="https://example.com/inquirex/form.json"
        data-inquirex-submit-to="https://example.com/inquirex"
        data-inquirex-llm-url="https://example.com/inquirex/llm"
        data-inquirex-launch="delay"
        data-inquirex-open-delay="1000"
        data-inquirex-position="bottom-right"
        data-inquirex-theme='{
          "headerBackground": "#111827",
          "headerText": "#ffffff",
          "questionBubbleBackground": "#ffffff",
          "answerBubbleBackground": "#2563eb",
          "answerBubbleText": "#ffffff",
          "padding": "16px",
          "triggerRadius": "50%"
        }'></script>
```

### URL Attributes

| Attribute | Purpose |
| --- | --- |
| `data-inquirex-dsl` | GET URL for the source Flow DSL JSON. |
| `data-inquirex-submit-to` | POST URL for the completed answer payload. Defaults to the DSL URL when omitted. |
| `data-inquirex-llm-url` | Exact POST endpoint for server/LLM verbs such as `extract`. |
| `data-inquirex-llm-timeout` | Timeout in ms before a server verb falls back to the normal form path. Defaults to `20000`. |

Backward-compatible aliases remain supported:

| Legacy attribute | New equivalent |
| --- | --- |
| `data-flow-url` | `data-inquirex-dsl` |
| `data-flow-json` | `data-inquirex-flow-json` |
| `data-flow-llm-prefix` | legacy `{prefix}/extract` mode |
| `data-flow-llm-url` | `data-inquirex-llm-url` |

## Server Verb Protocol

For new integrations, use `data-inquirex-llm-url` instead of a per-verb prefix.
When the flow reaches an `extract` step, the widget calls:

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

The endpoint can route by `verb`, reload the canonical DSL from
`inquirex_dsl`, inspect the current `step`, and use only server-side prompts,
schemas, models, and API keys. Future server verbs use the same endpoint with a
different `verb` value.

The old `data-flow-llm-prefix` still posts to `{prefix}/extract` for existing
users.

## Launch And Position

| Attribute | Values | Default |
| --- | --- | --- |
| `data-inquirex-launch` | `click`, `open`, `delay` | `click` |
| `data-inquirex-open-delay` | Milliseconds | `1000` |
| `data-inquirex-position` | `bottom-right`, `bottom-left` | `bottom-right` |

`click` shows only the launcher until clicked. `open` opens as soon as the
widget connects. `delay` opens after `data-inquirex-open-delay`.

## Custom Element Usage

```html
<script type="module">
  import "inquirex-js";
</script>

<inquirex-widget
  flow-url="/inquirex/form.json"
  submit-url="/inquirex"
  flow-llm-url="/inquirex/llm"
  launch-mode="click"
  position="bottom-left"
  style="--iq-header-bg:#111827; --iq-header-text:#fff;"
></inquirex-widget>
```

## Theme Variables

Every theme value can be set either from the DSL `meta.theme`, from
`data-inquirex-theme`, or as CSS custom properties on `<inquirex-widget>`.

| Theme key | CSS variable |
| --- | --- |
| `brand` | `--iq-brand` |
| `highlight` | `--iq-highlight` |
| `onBrand` | `--iq-on-brand` |
| `background` | `--iq-bg` |
| `surface` | `--iq-surface` |
| `text` | `--iq-text` |
| `textMuted` | `--iq-text-muted` |
| `border` | `--iq-border` |
| `radius` | `--iq-radius` |
| `font` | `--iq-font` |
| `fontSize` | `--iq-font-size` |
| `headerFont` | `--iq-header-font` |
| `headerFontSize` | `--iq-header-font-size` |
| `headerBackground` | `--iq-header-bg` |
| `headerText` | `--iq-header-text` |
| `questionBubbleBackground` | `--iq-question-bg` |
| `questionBubbleText` | `--iq-question-text` |
| `answerBubbleBackground` | `--iq-answer-bg` |
| `answerBubbleText` | `--iq-answer-text` |
| `padding` | `--iq-padding` |
| `triggerBackground` | `--iq-trigger-bg` |
| `triggerText` | `--iq-trigger-text` |
| `triggerRadius` | `--iq-trigger-radius` |

Additional raw `--iq-*` variables are accepted in `data-inquirex-theme` for
advanced overrides, including `--iq-panel-width`, `--iq-panel-max-height`,
`--iq-trigger-size`, `--iq-widget-offset-block`, and
`--iq-widget-offset-inline`.

## Qualified.at Bundles

Qualified.at can generate a single minified file per form, for example:

```html
<script async src="https://qualified.at/intake/inquirex-tax-preparer-2025.js"></script>
```

That generated file should bake in the same config object the script-tag adapter
normally reads from `data-*`: DSL JSON or DSL URL, submit URL, LLM URL, launch
behavior, position, and theme variables. The runtime remains identical; only the
configuration source changes.
