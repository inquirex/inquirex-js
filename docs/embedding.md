# Embedding Inquirex

The widget ships as one package with two familiar browser surfaces:

1. A **`<script src>` drop-in** (IIFE bundle) that self-initializes from
   `data-inquirex-*` attributes — the Intercom / Plausible / Cal.com model.
1. An **ESM package** (`import { mount } from "inquirex-js"`) for apps that
   bundle, with full TypeScript types.

Both funnel through the same configuration resolver, so every option below works
identically no matter how you load it.

## Configuration precedence

Each option is resolved from the first source that provides it, highest first:

1. an explicit `mount(config)` argument,
1. `data-inquirex-*` attributes on the loading `<script>`,
1. a `window.InquirexConfig` global set before the script,
1. a build-time baked config (`__INQUIREX_BAKED_CONFIG__`, the qualified.at
   per-form bundle),
1. built-in defaults.

The nested `theme` object merges key-by-key under the same rule.

## 1. Script-tag drop-in

```html
<script src="https://cdn.qualified.at/inquirex.js"
        data-inquirex-url="https://example.com/intake"
        data-inquirex-submit-to="https://example.com/intake/answers"
        data-inquirex-llm-url="https://example.com/intake/llm"
        data-inquirex-auth="<server-signed token>"
        data-inquirex-trigger="delay"
        data-inquirex-trigger-delay="1000"
        data-inquirex-position="bottom-right"></script>
```

### Attributes

| Attribute | Config key | Purpose |
| --- | --- | --- |
| `data-inquirex-url` | `url` | GET the flow DSL JSON. Also the POST target for answers unless `submit-to` is set. Forwarded to LLM verbs as `?dsl=`. |
| `data-inquirex-json` | `json` | Inline DSL JSON string — skips the GET. |
| `data-inquirex-site-id` | `siteId` | Derives `url` as `https://qualified.at/api/flows/{id}`. |
| `data-inquirex-submit-to` | `submitUrl` | POST completed answers here. Defaults to `url`. |
| `data-inquirex-llm-url` | `llmUrl` | POST endpoint for LLM verbs. Omit to disable LLM steps. |
| `data-inquirex-llm-timeout` | `llmTimeout` | Client timeout (ms) per LLM round-trip. Default `20000`. |
| `data-inquirex-auth` | `auth` | Bearer token forwarded on every request (see [Auth](#authenticating-requests)). |
| `data-inquirex-origins` | `origins` | Comma-separated origin allowlist; the widget renders nothing elsewhere. Defense-in-depth, not a security boundary. |
| `data-inquirex-trigger` | `trigger` | `click` \| `auto` \| `delay`. Default `click`. |
| `data-inquirex-trigger-delay` | `triggerDelay` | ms before auto-open when `trigger="delay"`. Default `1000`. |
| `data-inquirex-position` | `position` | `bottom-right` \| `bottom-left`. Default `bottom-right`. |

## 2. NPM / ESM

```ts
import { mount } from "inquirex-js";

mount({
  url: "https://example.com/intake",
  llmUrl: "https://example.com/intake/llm",
  trigger: "delay",
  triggerDelay: 1000,
  position: "bottom-left",
  theme: { headerBg: "#111827", highlight: "#f59e0b", radius: "0" },
});
```

`mount(config?, target?)` merges `config` with `window.InquirexConfig` and any
baked config, creates one `<inquirex-widget>`, appends it to `target`
(default `document.body`), and returns the element. `createWidget(config)`
returns the configured element **without** attaching it, for hosts that place it
themselves.

The custom element is the stable primitive; you can also write it by hand:

```html
<inquirex-widget url="/intake" llm-url="/intake/llm" position="bottom-left">
</inquirex-widget>
```

(Element attribute names drop the `data-inquirex-` prefix: `url`, `submit-to`,
`llm-url`, `llm-timeout`, `auth`, `trigger`, `trigger-delay`, `position`.)

## 3. Baked per-form bundle (qualified.at)

For a published form, everything is compiled into one minified
`inquirex-<form-id>.js` with the URLs, token, and theme inlined — the embed is a
single bare tag:

```html
<script async src="https://qualified.at/intake/inquirex-<form-id>.js"></script>
```

The build inlines the config through Vite's `define`:

```bash
vite build --define:__INQUIREX_BAKED_CONFIG__="$(cat form-config.json)"
```

Because baked config is the lowest-precedence source, a host can still override
any field at runtime via `window.InquirexConfig` or `mount()`.

## Launch & position

| `trigger` | Behaviour |
| --- | --- |
| `click` | Show only the launcher until the visitor clicks it (default). |
| `auto` | Open as soon as the widget loads. |
| `delay` | Open after `triggerDelay` ms — unless the visitor already interacted. |

`position` anchors the launcher and panel to `bottom-right` or `bottom-left`.

## Theming

Every visual is a CSS custom property. Set them **three** ways (precedence low →
high: built-in defaults < host CSS < config/flow theme):

**a. Host-page CSS** — custom properties inherit through the shadow boundary:

```css
inquirex-widget {
  --iq-header-bg: #111827;
  --iq-highlight: #f59e0b;
  --iq-radius: 0;
}
```

**b. Config `theme` / `data-inquirex-theme`** — camelCase keys map to the
variables below and are applied as inline style (so they win over host CSS).

**c. Flow `meta.theme`** — the same keys, authored in Ruby and shipped in the DSL.

| Theme key | CSS variable | Controls |
| --- | --- | --- |
| `brand` | `--iq-brand` | Primary accent (buttons, answer bubble, launcher) |
| `onBrand` | `--iq-on-brand` | Text on brand (auto-contrasted if omitted) |
| `background` | `--iq-bg` | Chat-window background |
| `surface` | `--iq-surface` | Input & bubble surface |
| `text` / `textMuted` | `--iq-text` / `--iq-text-muted` | Text colors |
| `border` | `--iq-border` | Input / divider borders |
| `headerBg` | `--iq-header-bg` | Header background (solid or gradient) |
| `headerText` | `--iq-header-text` | Header text/icon color |
| `headerFontSize` | `--iq-header-font-size` | Header title size |
| `highlight` | `--iq-highlight` | Form-widget selection / focus accent |
| `bubbleQuestionBg` / `bubbleQuestionText` | `--iq-bubble-q-bg` / `--iq-bubble-q-text` | Question bubble |
| `bubbleAnswerBg` / `bubbleAnswerText` | `--iq-bubble-a-bg` / `--iq-bubble-a-text` | Answer bubble |
| `launcherBg` / `launcherIcon` | `--iq-launcher-bg` / `--iq-launcher-icon` | Floating launcher |
| `radius` | `--iq-radius` | Panel & launcher corner radius (`0` = square) |
| `padding` | `--iq-pad` | Conversation inner padding |
| `font` / `headerFont` | `--iq-font` / `--iq-header-font` | Font families |

## Authenticating requests

The widget forwards one **server-signed bearer token** on every request — the
GET flow, the answers POST, and each LLM POST — from `data-inquirex-auth`
(config `auth`), falling back to the flow's `session.token`.

**The token is minted and verified server-side; the widget never computes it.**
This is deliberate: a SHA computed in the browser from a secret shipped in the
bundle is not security — anyone with DevTools reads the secret and reproduces it.
You cannot authenticate client code running on a third party's page.

What *does* hold:

- **Domain binding is free and strong on the server.** Browsers set `Origin` /
  `Referer` automatically and page JS cannot forge them cross-origin. Your API
  compares that header against the domain bound into the token.
- **Mint the token off the browser.** The embedder's backend (or qualified.at)
  computes `token = HMAC(per-form-secret, origin + form_id + exp)` at
  page-render or in the GET-flow response, with a short TTL. The widget only
  carries it.

See [extract-protocol.md](./extract-protocol.md#authenticating-requests-anti-spoofing)
for the full server-side verification model (HMAC, origin allowlist, per-session
budget, replay protection).
