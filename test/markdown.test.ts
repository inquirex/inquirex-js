// @vitest-environment happy-dom
//
// Scoped to this file on purpose: the rest of the suite is deliberately
// DOM-free and fast. The sanitizer is the one thing that cannot be tested
// without a real DOM, because walking the parsed tree is the whole mechanism.
import { describe, expect, it } from "vitest";
import { renderMarkdown, renderMarkdownToHtml } from "../src/markdown.js";

/** Render and return the resulting HTML, the way the widget will see it. */
function html(markdown: string): string {
  const holder = document.createElement("div");
  holder.appendChild(renderMarkdown(markdown));
  return holder.innerHTML;
}

describe("renderMarkdown — the formatting a summary needs", () => {
  it("renders headings", () => {
    expect(html("## What we covered")).toContain("<h2>What we covered</h2>");
  });

  it("renders bullet and numbered lists", () => {
    expect(html("- one\n- two")).toContain("<li>one</li>");
    expect(html("1. first\n2. second")).toContain("<ol>");
  });

  it("renders blockquotes", () => {
    expect(html("> quoted")).toContain("<blockquote>");
  });

  it("keeps the language class on a fenced block so it can be highlighted", () => {
    const out = html('```ruby\nputs "hi"\n```');
    expect(out).toContain("<pre>");
    expect(out).toContain('class="language-ruby"');
  });

  it("renders emphasis and inline code", () => {
    expect(html("**bold** and *italic* and `code`")).toContain(
      "<strong>bold</strong>",
    );
    expect(html("`code`")).toContain("<code>code</code>");
  });

  it("renders GFM tables", () => {
    const out = html("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(out).toContain("<table>");
    expect(out).toContain("<td>1</td>");
  });
});

// Summary text is model output, and the model's input is a transcript
// containing whatever the user typed. These are the cases someone would
// actually try to push through it.
describe("renderMarkdown — the allowlist", () => {
  it("does not execute or emit a script tag", () => {
    const out = html("Hello <script>alert(1)</script> there");
    expect(out).not.toContain("<script");
    expect(out).toContain("alert(1)");
  });

  it("strips an onerror handler from an injected image", () => {
    const out = html('<img src=x onerror="alert(1)">');
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("<img");
  });

  it("drops a javascript: link but keeps its text", () => {
    const out = html("[click me](javascript:alert(1))");
    expect(out).not.toContain("javascript:");
    expect(out).toContain("click me");
  });

  it("drops a data: URL link", () => {
    const out = html("[x](data:text/html;base64,PHNjcmlwdD4=)");
    expect(out).not.toContain("data:text/html");
  });

  it("keeps an ordinary https link, opened safely", () => {
    const out = html("[docs](https://example.com)");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });

  it("keeps mailto and relative links", () => {
    expect(html("[mail](mailto:alan.turing@manchester.edu)")).toContain(
      "mailto:",
    );
    expect(html("[rel](/somewhere)")).toContain('href="/somewhere"');
  });

  it("unwraps a disallowed element rather than deleting its text", () => {
    const out = html("<marquee>still readable</marquee>");
    expect(out).not.toContain("<marquee");
    expect(out).toContain("still readable");
  });

  it("strips style and event attributes from allowed elements", () => {
    const out = html('<p style="position:fixed" onclick="alert(1)">text</p>');
    expect(out).not.toContain("style=");
    expect(out).not.toContain("onclick");
    expect(out).toContain("text");
  });

  it("strips a class that is not a language tag", () => {
    const out = html('<code class="evil">x</code>');
    expect(out).not.toContain("evil");
  });

  // Parsing happens inside a <template>, so the iframe is never connected to
  // a browsing context and its src is never resolved — the allowlist sees the
  // element before anything can navigate on its behalf.
  it("removes an iframe entirely, src and all", () => {
    const out = html('<iframe src="https://evil.test/frame"></iframe>');
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("evil.test");
  });

  it("removes an embed and its source", () => {
    const out = html('<embed src="https://evil.test/x.swf">');
    expect(out).not.toContain("<embed");
    expect(out).not.toContain("evil.test");
  });

  it("handles empty and nullish input without throwing", () => {
    expect(html("")).toBe("");
    expect(() => renderMarkdown(undefined as unknown as string)).not.toThrow();
  });
});

describe("renderMarkdownToHtml", () => {
  it("applies the same allowlist as the DOM path, for the print window", () => {
    const out = renderMarkdownToHtml("## Title\n\n<script>alert(1)</script>");
    expect(out).toContain("<h2>Title</h2>");
    expect(out).not.toContain("<script");
  });
});

describe("renderMarkdown — non-element nodes", () => {
  it("drops HTML comments, which markdown passes through verbatim", () => {
    const out = html("Visible <!-- hidden note --> text");
    expect(out).not.toContain("hidden note");
    expect(out).toContain("Visible");
    expect(out).toContain("text");
  });

  it("drops a comment used to smuggle markup past a naive regex scrubber", () => {
    const out = html("<!--<script>alert(1)</script>-->");
    expect(out).not.toContain("alert(1)");
  });
});
