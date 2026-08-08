# CLAUDE.md — inquirex-widget

The embeddable JavaScript widget. A host page loads one bundle, the widget
fetches an [Inquirex](https://github.com/inquirex/inquirex) flow definition as
JSON, walks the visitor through it inside a floating panel, and POSTs the
answers back.

Two documents already exist and are not repeated here:

- **`../CLAUDE.md`** — the ecosystem: the gem family, the DSL vocabulary, the
  JSON wire format, and the lockstep versioning rule. Read it before changing
  anything that crosses the Ruby/JS boundary.
- **`README.md`** — the user-facing integration guide. If you change public
  behaviour, it changes too.

This file covers what someone working *in this repo* needs.

## Commands

`just` lists everything. The ones that matter:

```bash
just test        # vitest run — must be silent as well as green (see below)
just coverage    # vitest run --coverage, enforces thresholds
just typecheck   # both tsconfigs: the package, then demo + test
just check       # biome format + lint, writes fixes
just build       # vite lib build + .d.ts emit
just dev         # dev server on :3100, serves index.html
```

Before calling any change done: `just check && just typecheck && just coverage`.

## Module map

```
src/
  index.ts        entry point — registers elements, auto-mounts, re-exports API
  widget.ts       <inquirex-widget>, the LitElement that owns the panel
  engine.ts       FlowEngine: walks the graph, evaluates rules, holds answers
  config.ts       merges the four config sources by precedence
  server-verb.ts  one LLM round-trip; DOM-free on purpose, so it unit-tests
  markdown.ts     summary markdown → sanitized DOM (allowlist)
  print.ts        writes the summary into a separate window for printing
  theme.ts        theme keys → CSS custom properties
  types.ts        the wire format, in TypeScript. No runtime code.
  components/     five input controls, one per data-type family
demo/
  *.json          flow definitions for the dev page
  switcher.ts     the dev page's flow picker (not shipped)
```

Dependency direction is strictly downward: `components/` know nothing about the
engine, and `engine.ts`/`server-verb.ts` touch no DOM. Keep it that way — it is
why most of the suite runs without a browser environment.

## Invariants

These are load-bearing. Breaking one is a bug even if tests pass.

- **Rules are data, never functions.** The whole cross-site architecture rests
  on the frontend evaluating a serialized AST. If you find yourself wanting a
  callback in a transition, the answer is a new operator.
- **Flow-definition values are rendered as text, never HTML.** The sole
  exception is a `summarize` step's markdown, and it goes through
  `renderMarkdown`'s allowlist. Summary text is model output derived from a
  transcript the visitor wrote — treat it as hostile.
- **Shadow DOM isolation.** The widget must not leak styles into, or inherit
  them from, the host page.
- **An LLM failure degrades, never blocks.** Every server-verb path — no
  endpoint, timeout, non-2xx, malformed JSON — has a fallback that lets the
  visitor finish. `extract` falls back to asking the questions; `summarize`
  falls back to the ordinary completion screen.
- **The widget never sends a prompt, model name, or schema.** Those are
  server-side. See `docs/extract-protocol.md`.

## Testing

The suite is ~370 tests across 12 files and covers 100% of lines and functions
in `src/`.

**A passing run must also be a silent one.** Stack traces printed by a green
run are how a real failure gets missed. Two guards exist for this: DOM suites
install a `fetch` stub that throws on any unstubbed call, so nothing reaches
the network; and the markdown sanitizer parses inside a `<template>` rather
than a `DOMParser` document, so hostile fixtures do not make happy-dom navigate.

Conventions:

- Environment is opt-in per file: `// @vitest-environment happy-dom` on the
  first line. Files without it get no DOM, and that is the default for
  anything testable without one.
- `test/helpers/dom.ts` — mounting, shadow queries, and the several flavours of
  "wait". Read its comments before hand-rolling a wait; `flush` vs `microflush`
  vs `waitFor` exist for distinct reasons.
- `test/helpers/fetch.ts` — typed `fetch` doubles. `vi.fn(async () => body)`
  infers a zero-argument signature and silently stops type-checking every
  assertion about the request.
- `test/helpers/flows.ts` — small single-purpose flow fixtures. Prefer adding
  one over growing a shared mega-flow.
- Test names state the behaviour, not the method: "falls back to the step
  default when the field is left empty", not "handleSubmitInput works".

Coverage thresholds in `vitest.config.ts` are a **ratchet**, set just under
where the suite stands. Raise them when coverage rises. Do not lower them to
turn a build green — that is the failure the ratchet exists to catch. Note that
the text reporter omits rows at 100% on all four metrics, so a file vanishing
from the table is good news, not a missing measurement.

## Gotchas that have already cost time

Each of these was a real defect or a real hour lost. They are cheap to
re-introduce.

- **`window.open(url, target, "noopener")` returns `null`.** Per spec. Code
  that needs the handle — `print.ts` writes a whole document into it — must not
  pass `noopener`. The symptom is misleading: a blank tab opens *and* the UI
  reports a popup blocker.
- **`option.selected = true` does not survive insertion.** Set `select.value`
  after appending the options, or the control shows one thing while the page
  loaded another.
- **`customElements` survives `vi.resetModules()`.** Re-importing a module that
  calls `@customElement` throws. `test/index.test.ts` shows the fix: make
  `define` keep the first registration.
- **`iq-enum-select` and `iq-boolean-input` auto-submit on a 200ms delay**, so
  the visitor sees their choice highlight. Tests must wait it out or use fake
  timers; four `setTimeout(0)` ticks are not enough.
- **lit renders `nothing` as an empty comment**, so a "renders nothing" test
  cannot assert `innerHTML === ""`. Assert no elements instead.
- **`import.meta.env.DEV` is true under vitest**, so the debug inspector and its
  dynamic `@speed-highlight/core` import are live in tests.

## Two tsconfigs

`tsconfig.json` builds the package: `rootDir: "src"`, emits `.d.ts` into
`dist/`. It deliberately does not see `demo/` or `test/`.

`tsconfig.demo.json` type-checks `demo/`, `test/`, and the Vite configs with
`noEmit`. `just typecheck` runs both. Without the second one, test and demo code
is never type-checked at all — which is how a latent error sat in
`test/summarize.test.ts` unnoticed.

## The demo page

`index.html` is a fake host site for manual testing. The picker in the
bottom-left corner (`demo/switcher.ts`) lists every `demo/*.json` and reloads
the page on change, carrying the selection in `?flow=`. Reloading is the point:
the widget reads its definition once at connect time, so switching flows any
other way would not exercise the path a real embed takes.

Nothing in `demo/` ships — `package.json` publishes `dist/` only.

## Conventions

- TypeScript, 2-space indent, Biome-formatted, 80 columns. `just check` is
  authoritative. Where a hand-grouped literal reads better than the formatter's
  output, `// biome-ignore format:` with a reason is acceptable; it is rare.
- Comments explain *why*. The existing code sets the bar — see the header of
  `markdown.ts` or `print.ts`. Do not add comments that restate the line below.
- Public functions, exported types, and element properties get doc comments.
- English only, everywhere.
- Never use a real person's name or address as an example. The canonical
  placeholder is `Alan Turing <alan.turing@manchester.edu>`; UI input
  placeholders use a functional hint ("Your Name", "you@example.com") instead.

## Releasing

`inquirex-widget` moves in lockstep with `inquirex`, `inquirex-llm`,
`inquirex-tools`, and `inquirex-webui` — they share a serialization format, and
a verb present in one and missing from another fails silently rather than
loudly. Never bump this package alone; use `inquirex versions --set X.Y.Z`.
Details in `../CLAUDE.md`.
