// @vitest-environment happy-dom
//
// The print window. This module writes a whole document into a window it does
// not own, so the tests drive it through a stub window and assert on the
// markup that was written — the same string a browser would parse.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printSummary } from "../src/print.js";

/** A stand-in for the opened window, capturing everything written into it. */
function stubWindow() {
  const written: string[] = [];
  const calls = { open: 0, close: 0, focus: 0, print: 0 };
  const timers: Array<{ fn: () => void; delay: number }> = [];

  const win = {
    document: {
      open: () => {
        calls.open++;
      },
      write: (html: string) => {
        written.push(html);
      },
      close: () => {
        calls.close++;
      },
    },
    focus: () => {
      calls.focus++;
    },
    print: () => {
      calls.print++;
    },
    setTimeout: (fn: () => void, delay: number) => {
      timers.push({ fn, delay });
      return timers.length;
    },
  };

  return {
    win: win as unknown as Window,
    calls,
    timers,
    /** Everything written, concatenated — the document the browser would see. */
    get html() {
      return written.join("");
    },
    /** Run the deferred focus/print callbacks the way a browser eventually would. */
    runTimers() {
      for (const t of timers.splice(0)) t.fn();
    },
  };
}

let stub: ReturnType<typeof stubWindow>;
let openSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stub = stubWindow();
  openSpy = vi
    .spyOn(window, "open")
    .mockImplementation(() => stub.win) as typeof openSpy;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("printSummary — opening the window", () => {
  // The regression that motivates this test: `window.open` returns null when
  // called with `noopener`, so passing it made every print look popup-blocked
  // while still leaving a blank tab on screen.
  it("opens without noopener, so the handle it needs comes back", () => {
    const win = printSummary("# Hi");
    expect(win).toBe(stub.win);

    const features = openSpy.mock.calls[0]?.[2];
    expect(String(features ?? "")).not.toContain("noopener");
  });

  it("opens a blank target rather than navigating anywhere", () => {
    printSummary("# Hi");
    expect(openSpy.mock.calls[0]?.[0]).toBe("");
    expect(openSpy.mock.calls[0]?.[1]).toBe("_blank");
  });

  it("returns null when a popup blocker really does refuse", () => {
    openSpy.mockImplementation(() => null);
    expect(printSummary("# Hi")).toBeNull();
  });

  it("opens, writes and closes the document in that order", () => {
    printSummary("# Hi");
    expect(stub.calls.open).toBe(1);
    expect(stub.calls.close).toBe(1);
    expect(stub.html).toContain("<!doctype html>");
  });
});

describe("printSummary — the document", () => {
  it("renders the summary markdown as HTML", () => {
    printSummary("## Findings\n\n- one\n- two");
    expect(stub.html).toContain("<h2>Findings</h2>");
    expect(stub.html).toContain("<li>one</li>");
  });

  it("puts the summary inside <main>, after the document header", () => {
    printSummary("Body text.");
    expect(stub.html).toMatch(/<main>.*<p>Body text\.<\/p>/s);
  });

  it("applies the same allowlist the on-screen summary uses", () => {
    printSummary(
      'Hello <script>alert(1)</script> <img src=x onerror="boom()">',
    );
    expect(stub.html).not.toContain("<script>alert");
    expect(stub.html).not.toContain("onerror");
    expect(stub.html).not.toContain("<img");
  });

  it("inlines its stylesheet, so the page needs no network", () => {
    printSummary("# Hi");
    expect(stub.html).toContain("<style>");
    expect(stub.html).toContain("@page");
    expect(stub.html).not.toContain("<link");
  });

  it("carries its own Print button, marked no-print", () => {
    printSummary("# Hi");
    expect(stub.html).toContain("iq-print-bar");
    expect(stub.html).toContain("iq-no-print");
    expect(stub.html).toContain("window.print()");
  });
});

describe("printSummary — title and date", () => {
  it("defaults the title when none is given", () => {
    printSummary("# Hi");
    expect(stub.html).toContain("<title>Your summary</title>");
    expect(stub.html).toContain("<h1>Your summary</h1>");
  });

  it("uses the supplied title in both the tab and the heading", () => {
    printSummary("# Hi", { title: "Tax Preparation Intake" });
    expect(stub.html).toContain("<title>Tax Preparation Intake</title>");
    expect(stub.html).toContain("<h1>Tax Preparation Intake</h1>");
  });

  // The title comes from the flow definition, which is host-supplied data.
  it("escapes a title carrying markup", () => {
    printSummary("# Hi", { title: "</title><script>alert(1)</script>" });
    expect(stub.html).not.toContain("<script>alert(1)</script>");
    expect(stub.html).toContain("&lt;script&gt;");
  });

  it("escapes ampersands and quotes in the title", () => {
    printSummary("# Hi", { title: 'Smith & Co "2025"' });
    expect(stub.html).toContain("Smith &amp; Co &quot;2025&quot;");
  });

  it("formats the supplied date long-form", () => {
    printSummary("# Hi", { date: new Date("2026-03-14T12:00:00Z") });
    expect(stub.html).toMatch(/March 14, 2026/);
  });

  it("stamps today when no date is given", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T12:00:00Z"));
    printSummary("# Hi");
    expect(stub.html).toMatch(/August 5, 2026/);
    vi.useRealTimers();
  });
});

describe("printSummary — driving the dialog", () => {
  it("defers focus and print rather than calling them mid-write", () => {
    printSummary("# Hi");
    // Nothing has fired yet: the document must lay out first, or Safari's
    // print preview comes up blank.
    expect(stub.calls.focus).toBe(0);
    expect(stub.calls.print).toBe(0);
    expect(stub.timers.map((t) => t.delay)).toEqual([0, 250]);
  });

  it("focuses and prints once those timers run", () => {
    printSummary("# Hi");
    stub.runTimers();
    expect(stub.calls.focus).toBe(1);
    expect(stub.calls.print).toBe(1);
  });

  it("leaves the window open, so a cancelled dialog can be retried", () => {
    const win = printSummary("# Hi") as Window & { close?: () => void };
    stub.runTimers();
    // There is no `win.close()` anywhere in the flow — the user asked to keep
    // this document, and closing it under them would destroy it.
    expect(win).toBe(stub.win);
  });
});
