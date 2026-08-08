import { renderMarkdownToHtml } from "./markdown.js";

/**
 * Printing the summary.
 *
 * This opens a new window and writes a complete document into it, rather than
 * styling the widget for `@media print`. Two reasons, both structural:
 *
 * 1. The widget renders inside a Shadow DOM. A host page's print stylesheet
 *    cannot reach into shadow content, and the widget's own styles are sealed
 *    inside it — so there is no stylesheet either side can write that governs
 *    the printed page.
 * 2. Printing in place prints the *host page* with the widget on top of it:
 *    the customer's navigation, cookie banner, and footer, with a summary
 *    squeezed into a floating panel. What the user asked for is the summary,
 *    full width, on paper.
 *
 * The document is self-contained — inline styles, no external requests — so
 * it renders identically regardless of the host page or network.
 */

/** Print stylesheet. Serif body at a readable measure, with the page furniture
 *  print needs: no orphaned headings, no split code blocks, visible link URLs. */
const PRINT_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 2.5rem 3rem;
    font-family: Charter, "Bitstream Charter", "Iowan Old Style", Georgia, serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #14161a;
    background: #fff;
    -webkit-text-size-adjust: 100%;
  }
  main { max-width: 100%; }
  header.iq-doc-head {
    border-bottom: 1.5pt solid #14161a;
    padding-bottom: 0.6rem;
    margin-bottom: 1.8rem;
  }
  header.iq-doc-head h1 {
    margin: 0;
    font-size: 17pt;
    letter-spacing: -0.01em;
  }
  header.iq-doc-head .iq-doc-meta {
    margin-top: 0.25rem;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 9pt;
    color: #5b6270;
  }
  h1, h2, h3, h4 {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    line-height: 1.25;
    margin: 1.6em 0 0.5em;
    break-after: avoid;
    page-break-after: avoid;
  }
  h2 { font-size: 14pt; }
  h3 { font-size: 12.5pt; }
  h4 { font-size: 11pt; }
  p, li { orphans: 3; widows: 3; }
  p { margin: 0 0 0.85em; }
  ul, ol { margin: 0 0 0.95em; padding-left: 1.5em; }
  li { margin: 0.25em 0; }
  blockquote {
    margin: 1.1em 0;
    padding: 0.1em 0 0.1em 1.1em;
    border-left: 2.5pt solid #b9bfcb;
    color: #3c434f;
    font-style: italic;
    break-inside: avoid;
  }
  code {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.86em;
    background: #f2f3f5;
    padding: 0.12em 0.34em;
    border-radius: 3px;
  }
  pre {
    background: #f7f8fa;
    border: 0.5pt solid #d8dce3;
    border-radius: 4px;
    padding: 0.85em 1em;
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  pre code { background: none; padding: 0; font-size: 9.5pt; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.1em 0;
    font-size: 10.5pt;
    break-inside: avoid;
  }
  th, td { border: 0.5pt solid #c8cdd6; padding: 0.4em 0.6em; text-align: left; }
  th { background: #f2f3f5; font-family: ui-sans-serif, system-ui, sans-serif; }
  hr { border: 0; border-top: 0.5pt solid #c8cdd6; margin: 1.8em 0; }
  a { color: #14161a; text-decoration: underline; }

  @media print {
    body { padding: 0; font-size: 11pt; }
    /* On paper a link's text is useless without its target. */
    a[href^="http"]::after {
      content: " (" attr(href) ")";
      font-size: 8.5pt;
      color: #5b6270;
      word-break: break-all;
    }
    .iq-no-print { display: none !important; }
  }

  @page { margin: 18mm 16mm; }

  .iq-print-bar {
    position: fixed;
    top: 1rem;
    right: 1rem;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  .iq-print-bar button {
    font: inherit;
    font-size: 10pt;
    padding: 0.45em 1.1em;
    border: 1px solid #14161a;
    border-radius: 5px;
    background: #14161a;
    color: #fff;
    cursor: pointer;
  }
`;

/** Escape text for safe interpolation into the document's markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Options for {@link printSummary}. */
export interface PrintSummaryOptions {
  /** Document title and page heading. */
  title?: string;
  /** Date shown under the heading; defaults to today, formatted long. */
  date?: Date;
}

/**
 * Open the summary in a new window, formatted for print.
 *
 * The window is left open rather than auto-closed after printing: the user may
 * cancel the dialog, and closing under them would destroy the thing they asked
 * to keep. It carries its own "Print" button so a cancelled dialog can be
 * reopened without regenerating anything.
 *
 * @param markdown the summary, as markdown
 * @param options title and date for the document header
 * @returns the opened window, or null when a popup blocker refused it
 */
export function printSummary(
  markdown: string,
  options: PrintSummaryOptions = {},
): Window | null {
  // No `noopener` here, deliberately. Per the HTML spec a window opened with
  // it returns null — and this function's entire job is to write a document
  // into the handle it gets back. Passing it produced the worst of both
  // outcomes: a blank tab opened, the handle came back null, and the widget
  // reported a popup blocker that had not blocked anything.
  //
  // Nothing is given away by omitting it. `noopener` protects against a
  // *third-party destination* reading `window.opener`; the destination here is
  // about:blank, populated with markup this module generates and the summary
  // allowlist has already vetted. There is no other origin in the picture.
  const win = window.open("", "_blank");
  if (!win) return null;

  const title = options.title ?? "Your summary";
  const date = options.date ?? new Date();
  const stamp = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // renderMarkdownToHtml runs the same allowlist the on-screen summary uses,
  // so the printed page can never contain something the panel refused.
  const body = renderMarkdownToHtml(markdown);

  win.document.open();
  win.document.write(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head><body>` +
      `<div class="iq-print-bar iq-no-print"><button type="button" onclick="window.print()">Print</button></div>` +
      `<main><header class="iq-doc-head"><h1>${escapeHtml(title)}</h1>` +
      `<div class="iq-doc-meta">${escapeHtml(stamp)}</div></header>` +
      `${body}</main></body></html>`,
  );
  win.document.close();

  // Let the document lay out before the dialog measures it; without this the
  // print preview can come up blank in Safari.
  win.setTimeout(() => win.focus(), 0);
  win.setTimeout(() => win.print(), 250);

  return win;
}
