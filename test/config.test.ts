import { describe, it, expect } from "vitest";
import {
  resolveConfig,
  mergeConfigs,
  readScriptConfig,
  hasFlowSource,
} from "../src/config.js";
import type { InquirexConfig } from "../src/types.js";

/** A minimal stand-in for the loading <script>, driven by a plain attribute map. */
function fakeScript(attrs: Record<string, string>): HTMLScriptElement {
  return {
    getAttribute: (name: string) =>
      name in attrs ? attrs[name] : null,
  } as unknown as HTMLScriptElement;
}

describe("readScriptConfig", () => {
  it("maps every data-inquirex-* attribute onto config keys", () => {
    const cfg = readScriptConfig(
      fakeScript({
        "data-inquirex-url": "https://x.test/flow.json",
        "data-inquirex-submit-to": "https://x.test/answers",
        "data-inquirex-llm-url": "https://x.test/llm",
        "data-inquirex-llm-timeout": "5000",
        "data-inquirex-auth": "tok-1",
        "data-inquirex-trigger": "delay",
        "data-inquirex-trigger-delay": "800",
        "data-inquirex-position": "bottom-left",
      }),
    );
    expect(cfg.url).toBe("https://x.test/flow.json");
    expect(cfg.submitUrl).toBe("https://x.test/answers");
    expect(cfg.llmUrl).toBe("https://x.test/llm");
    expect(cfg.llmTimeout).toBe(5000);
    expect(cfg.auth).toBe("tok-1");
    expect(cfg.trigger).toBe("delay");
    expect(cfg.triggerDelay).toBe(800);
    expect(cfg.position).toBe("bottom-left");
  });

  it("leaves numeric fields unset when their attributes are absent", () => {
    const cfg = readScriptConfig(fakeScript({ "data-inquirex-url": "u" }));
    expect(cfg.llmTimeout).toBeUndefined();
    expect(cfg.triggerDelay).toBeUndefined();
  });

  it("parses data-inquirex-origins into a trimmed list", () => {
    const cfg = readScriptConfig(
      fakeScript({
        "data-inquirex-origins": "https://a.com, https://b.com ,",
      }),
    );
    expect(cfg.origins).toEqual(["https://a.com", "https://b.com"]);
  });

  it("parses a data-inquirex-theme JSON object", () => {
    const cfg = readScriptConfig(
      fakeScript({ "data-inquirex-theme": '{"headerBg":"#111","radius":"0"}' }),
    );
    expect(cfg.theme).toEqual({ headerBg: "#111", radius: "0" });
  });

  it("ignores malformed theme JSON instead of throwing", () => {
    const cfg = readScriptConfig(
      fakeScript({ "data-inquirex-theme": "{not json" }),
    );
    expect(cfg.theme).toBeUndefined();
  });
});

describe("mergeConfigs — earliest source wins", () => {
  it("fills unset keys from later sources only", () => {
    const merged = mergeConfigs(
      { url: "from-override" },
      { url: "from-script", llmUrl: "script-llm" },
      { llmUrl: "global-llm", auth: "global-auth" },
    );
    expect(merged.url).toBe("from-override");
    expect(merged.llmUrl).toBe("script-llm");
    expect(merged.auth).toBe("global-auth");
  });

  it("ignores undefined and empty-string values", () => {
    const merged = mergeConfigs(
      { url: "", auth: undefined } as InquirexConfig,
      { url: "real", auth: "real-tok" },
    );
    expect(merged.url).toBe("real");
    expect(merged.auth).toBe("real-tok");
  });

  it("deep-merges theme, earliest key winning", () => {
    const merged = mergeConfigs(
      { theme: { brand: "#111" } },
      { theme: { brand: "#999", radius: "0" } },
    );
    expect(merged.theme).toEqual({ brand: "#111", radius: "0" });
  });
});

describe("resolveConfig — normalization", () => {
  it("derives a qualified.at url from a site id", () => {
    const cfg = resolveConfig(null, { siteId: "abc123" });
    expect(cfg.url).toBe("https://qualified.at/api/flows/abc123");
  });

  it("prefers an explicit url over a site id", () => {
    const cfg = resolveConfig(null, { siteId: "abc", url: "https://own.test/f" });
    expect(cfg.url).toBe("https://own.test/f");
  });

  it("falls the submit target back to the flow url", () => {
    const cfg = resolveConfig(null, { url: "https://own.test/f" });
    expect(cfg.submitUrl).toBe("https://own.test/f");
  });

  it("keeps a distinct submit target when given", () => {
    const cfg = resolveConfig(null, {
      url: "https://own.test/f",
      submitUrl: "https://own.test/answers",
    });
    expect(cfg.submitUrl).toBe("https://own.test/answers");
  });

  it("applies behaviour defaults", () => {
    const cfg = resolveConfig(null, { url: "u" });
    expect(cfg.trigger).toBe("click");
    expect(cfg.triggerDelay).toBe(1000);
    expect(cfg.position).toBe("bottom-right");
    expect(cfg.llmTimeout).toBe(20000);
  });

  it("reads a script tag when no override is given", () => {
    const cfg = resolveConfig(
      fakeScript({ "data-inquirex-url": "https://s.test/f" }),
    );
    expect(cfg.url).toBe("https://s.test/f");
    expect(cfg.submitUrl).toBe("https://s.test/f");
  });

  it("lets an override outrank the script tag", () => {
    const cfg = resolveConfig(
      fakeScript({ "data-inquirex-url": "https://s.test/f" }),
      { url: "https://o.test/f" },
    );
    expect(cfg.url).toBe("https://o.test/f");
  });
});

describe("hasFlowSource", () => {
  it("is true when any flow source is present", () => {
    expect(hasFlowSource({ url: "u" })).toBe(true);
    expect(hasFlowSource({ json: "{}" })).toBe(true);
    expect(hasFlowSource({ siteId: "s" })).toBe(true);
  });

  it("is false with no source", () => {
    expect(hasFlowSource({ trigger: "auto" })).toBe(false);
  });
});
