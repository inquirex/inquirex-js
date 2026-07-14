import { LitElement, html, css, nothing, type PropertyValues } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { FlowEngine } from "./engine.js";
import { runServerVerb } from "./server-verb.js";
import { applyTheme, applyThemeOverrides } from "./theme.js";
import type {
  FlowDefinition,
  StepDefinition,
  HistoryEntry,
  Option,
  ThemeOverrides,
  TriggerMode,
  WidgetPosition,
} from "./types.js";

// Register sub-components (side-effect imports)
import "./components/text-input.js";
import "./components/number-input.js";
import "./components/enum-select.js";
import "./components/multi-enum.js";
import "./components/boolean-input.js";

import type { IqTextInput } from "./components/text-input.js";
import type { IqNumberInput } from "./components/number-input.js";
import type { IqEnumSelect } from "./components/enum-select.js";
import type { IqMultiEnum } from "./components/multi-enum.js";
import type { IqBooleanInput } from "./components/boolean-input.js";

const CHAT_ICON = html`<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const CLOSE_ICON = html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const SEND_ICON = html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
const CHECK_ICON = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const BUG_ICON = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="6" width="8" height="14" rx="4"/><line x1="12" y1="6" x2="12" y2="4"/><line x1="9.5" y1="4" x2="14.5" y2="4"/><line x1="19" y1="8" x2="16" y2="10"/><line x1="5" y1="8" x2="8" y2="10"/><line x1="19" y1="18" x2="16" y2="16"/><line x1="5" y1="18" x2="8" y2="16"/><line x1="19" y1="13" x2="16" y2="13"/><line x1="5" y1="13" x2="8" y2="13"/></svg>`;

@customElement("inquirex-widget")
export class InquirexWidget extends LitElement {
  static styles = css`
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');

    :host {
      /* ── Brand ── */
      --iq-brand: #2563eb;
      --iq-brand-dark: color-mix(in srgb, var(--iq-brand) 85%, #000);
      --iq-on-brand: #ffffff;

      /* ── Form-widget selection / focus accent ── */
      --iq-highlight: var(--iq-brand);

      /* ── Surfaces ── */
      --iq-bg: #f8f7f4;
      --iq-surface: #ffffff;
      --iq-text: #1c1917;
      --iq-text-muted: #78716c;
      --iq-border: #e7e5e4;

      /* ── Header ── */
      --iq-header-bg: linear-gradient(135deg, var(--iq-brand), var(--iq-brand-dark));
      --iq-header-text: var(--iq-on-brand);
      --iq-header-font-size: 18px;

      /* ── Chat bubbles ── */
      --iq-bubble-q-bg: var(--iq-surface);
      --iq-bubble-q-text: var(--iq-text);
      --iq-bubble-a-bg: var(--iq-brand);
      --iq-bubble-a-text: var(--iq-on-brand);

      /* ── Launcher ── */
      --iq-launcher-bg: var(--iq-brand);
      --iq-launcher-icon: var(--iq-on-brand);

      /* ── Geometry & type ── */
      --iq-radius: 18px;
      --iq-pad: 16px;
      --iq-font: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
      --iq-header-font: var(--iq-font);

      font-family: var(--iq-font);
      font-size: 15px;
      line-height: 1.5;
      color: var(--iq-text);
      position: fixed;
      bottom: 24px;
      right: 24px;
      left: auto;
      z-index: 99999;
    }

    /* Anchor to the opposite corner. */
    :host([position="bottom-left"]) { right: auto; left: 24px; }

    /* ── Floating trigger bubble ── */
    .bubble {
      width: 60px; height: 60px;
      border-radius: 50%;
      background: var(--iq-launcher-bg);
      color: var(--iq-launcher-icon);
      border: none;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow:
        0 4px 20px color-mix(in srgb, var(--iq-launcher-bg) 35%, transparent),
        0 2px 8px rgba(0,0,0,0.08);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      position: relative;
    }
    .bubble:hover {
      transform: scale(1.08);
      box-shadow:
        0 6px 28px color-mix(in srgb, var(--iq-launcher-bg) 45%, transparent),
        0 2px 8px rgba(0,0,0,0.1);
    }
    .bubble:active { transform: scale(0.95); }
    .bubble.has-pulse::after {
      content: '';
      position: absolute; inset: -4px;
      border-radius: 50%;
      border: 2px solid var(--iq-launcher-bg);
      animation: pulse 2s ease-out infinite;
    }
    @keyframes pulse {
      0% { transform: scale(1); opacity: 0.6; }
      100% { transform: scale(1.4); opacity: 0; }
    }

    /* ── Panel container ── */
    .panel {
      position: absolute;
      bottom: 72px; right: 0; left: auto;
      width: 400px;
      max-height: 620px;
      background: var(--iq-bg);
      border-radius: var(--iq-radius);
      box-shadow:
        0 20px 60px rgba(0,0,0,0.12),
        0 8px 24px rgba(0,0,0,0.06),
        0 0 0 1px rgba(0,0,0,0.04);
      display: flex; flex-direction: column;
      overflow: hidden;
      transform-origin: bottom right;
      animation: panelIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .panel.closing {
      animation: panelOut 0.25s cubic-bezier(0.4, 0, 1, 1) forwards;
    }
    @keyframes panelIn {
      from { opacity: 0; transform: scale(0.92) translateY(12px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes panelOut {
      from { opacity: 1; transform: scale(1) translateY(0); }
      to   { opacity: 0; transform: scale(0.92) translateY(12px); }
    }

    /* Mirror the panel (and dev inspector) when anchored bottom-left. */
    :host([position="bottom-left"]) .panel {
      right: auto; left: 0;
      transform-origin: bottom left;
    }
    :host([position="bottom-left"]) .debug-panel {
      right: auto; left: calc(400px + 12px);
      transform-origin: bottom left;
    }

    /* ── Header ── */
    .header {
      background: var(--iq-header-bg);
      color: var(--iq-header-text);
      padding: 20px 20px 18px;
      position: relative;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .header-logo {
      flex-shrink: 0;
      width: 60px; height: 60px;
      border-radius: 10px;
      overflow: hidden;
      background: color-mix(in srgb, var(--iq-header-text) 12%, transparent);
      display: flex; align-items: center; justify-content: center;
    }
    .header-logo img {
      width: 100%; height: 100%;
      object-fit: contain;
      display: block;
    }
    .header-text { flex: 1; min-width: 0; padding-right: 72px; }
    .header-title {
      font-family: var(--iq-header-font);
      font-size: var(--iq-header-font-size); font-weight: 700;
      margin: 0 0 2px;
      letter-spacing: -0.01em;
    }
    .header-subtitle {
      font-size: 13px;
      opacity: 0.85;
      margin: 0;
    }
    .close-btn {
      position: absolute; top: 14px; right: 14px;
      background: color-mix(in srgb, var(--iq-header-text) 18%, transparent);
      border: none; color: var(--iq-header-text);
      width: 32px; height: 32px;
      border-radius: 8px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
    }
    .close-btn:hover { background: color-mix(in srgb, var(--iq-header-text) 30%, transparent); }

    /* ── Debug button (dev only, sits next to the X) ── */
    .debug-btn {
      position: absolute; top: 14px; right: 54px;
      background: color-mix(in srgb, var(--iq-header-text) 18%, transparent);
      border: none; color: var(--iq-header-text);
      width: 32px; height: 32px;
      border-radius: 8px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, transform 0.1s;
    }
    .debug-btn:hover { background: color-mix(in srgb, var(--iq-header-text) 30%, transparent); }
    .debug-btn:active { transform: scale(0.92); }

    /* ── Debug panel (dev only — Ayu Dark inspired JSON inspector) ── */
    .debug-panel {
      position: absolute;
      bottom: 72px;
      right: calc(400px + 12px);
      width: min(60vw, 720px);
      height: min(85dvh, 820px);
      background: #0b0e14;
      color: #bfbdb6;
      border-radius: var(--iq-radius);
      box-shadow:
        0 20px 60px rgba(0,0,0,0.45),
        0 8px 24px rgba(0,0,0,0.25),
        0 0 0 1px rgba(255,255,255,0.04);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: 'Fantasque Sans Mono', 'Cascadia Mono', Consolas, D2Coding, monospace;
      animation: panelIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      transform-origin: bottom right;
    }
    .debug-header {
      padding: 14px 18px;
      background: linear-gradient(180deg, #11151c, #0d1117);
      border-bottom: 1px solid #1e232d;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #565b66;
      flex-shrink: 0;
    }
    .debug-title {
      display: inline-flex; align-items: center; gap: 8px;
      color: #bfbdb6;
      font-weight: 600;
    }
    .debug-title svg { color: #59c2ff; }
    .debug-meta { color: #565b66; font-size: 10px; }
    .debug-content {
      flex: 1;
      overflow: auto;
      margin: 0;
      padding: 18px 20px;
      font-size: 13px;
      line-height: 1.65;
      white-space: pre;
      tab-size: 2;
    }
    .debug-content::-webkit-scrollbar { width: 10px; height: 10px; }
    .debug-content::-webkit-scrollbar-thumb {
      background: #1e232d; border-radius: 6px;
      border: 2px solid #0b0e14;
    }
    .debug-content::-webkit-scrollbar-thumb:hover { background: #2a313d; }

    /* Ayu Dark token colors — speed-highlight class names */
    .shj-syn-var  { color: #59c2ff; }                        /* JSON keys */
    .shj-syn-str  { color: #aad94c; }                        /* strings */
    .shj-syn-num  { color: #d2a6ff; }                        /* numbers + null */
    .shj-syn-bool { color: #ffad66; font-style: italic; }    /* true/false */
    .shj-syn-oper, .shj-syn-deleted { color: #565b66; }
    .shj-syn-cmnt { color: #565b66; font-style: italic; }
    .debug-content code { display: block; }

    /* Hide debug panel on small screens */
    @media (max-width: 900px) {
      .debug-panel { display: none; }
    }

    /* ── Progress bar ── */
    .progress {
      height: 3px;
      background: color-mix(in srgb, var(--iq-on-brand) 18%, transparent);
    }
    .progress-fill {
      height: 100%;
      background: color-mix(in srgb, var(--iq-on-brand) 75%, transparent);
      transition: width 0.4s ease;
      border-radius: 0 2px 2px 0;
    }

    /* ── Conversation area ── */
    .conversation {
      flex: 1;
      overflow-y: auto;
      padding: var(--iq-pad) var(--iq-pad) 8px;
      display: flex; flex-direction: column; gap: 12px;
      scroll-behavior: smooth;
    }

    /* ── Message bubbles ── */
    .msg { max-width: 88%; animation: msgIn 0.3s ease forwards; }
    .msg-q { align-self: flex-start; }
    .msg-a { align-self: flex-end; }
    @keyframes msgIn {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .bubble-q {
      background: var(--iq-bubble-q-bg);
      color: var(--iq-bubble-q-text);
      padding: 12px 16px;
      border-radius: 14px 14px 14px 4px;
      font-size: 15px;
      line-height: 1.5;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .bubble-a {
      background: var(--iq-bubble-a-bg);
      color: var(--iq-bubble-a-text);
      padding: 10px 16px;
      border-radius: 14px 14px 4px 14px;
      font-size: 14px;
      display: flex; align-items: center; gap: 8px;
    }
    .bubble-a .check { opacity: 0.7; flex-shrink: 0; }

    /* ── Display verb styles ── */
    .msg-header .bubble-q {
      font-size: 17px; font-weight: 700;
      background: transparent;
      padding: 8px 0;
      box-shadow: none;
      letter-spacing: -0.01em;
    }
    .msg-btw .bubble-q {
      background: color-mix(in srgb, var(--iq-brand) 6%, var(--iq-surface));
      border-left: 3px solid var(--iq-brand);
      border-radius: 4px 14px 14px 4px;
    }
    .msg-warning .bubble-q {
      background: #fef3c7;
      border-left: 3px solid #f59e0b;
      border-radius: 4px 14px 14px 4px;
      color: #92400e;
    }

    /* ── Input area ── */
    .input-area {
      padding: 12px var(--iq-pad) var(--iq-pad);
      border-top: 1px solid var(--iq-border);
      background: var(--iq-surface);
      animation: msgIn 0.3s ease forwards;
    }
    .input-row {
      display: flex; gap: 8px; align-items: flex-end;
    }
    .input-row > :first-child { flex: 1; }

    .submit-btn {
      width: 42px; height: 42px;
      border-radius: 10px;
      background: var(--iq-brand);
      color: var(--iq-on-brand);
      border: none;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s, transform 0.1s;
    }
    .submit-btn:hover { background: var(--iq-brand-dark); }
    .submit-btn:active { transform: scale(0.93); }
    .submit-btn:disabled {
      opacity: 0.4; cursor: default;
      transform: none;
    }

    .continue-btn {
      width: 100%;
      padding: 12px;
      border-radius: 10px;
      background: var(--iq-brand);
      color: var(--iq-on-brand);
      border: none;
      font-family: inherit;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
    }
    .continue-btn:hover { background: var(--iq-brand-dark); }
    .continue-btn:active { transform: scale(0.98); }

    /* ── Completion ── */
    .complete {
      text-align: center;
      padding: 24px 16px;
    }
    .complete-icon {
      width: 56px; height: 56px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--iq-brand) 10%, var(--iq-bg));
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 12px;
      color: var(--iq-brand);
    }
    .complete-text { font-size: 14px; color: var(--iq-text-muted); }

    /* ── Powered-by footer ── */
    .footer {
      padding: 8px 16px 12px;
      text-align: center;
      font-size: 11px;
      color: var(--iq-text-muted);
      opacity: 0.6;
    }
    .footer a {
      color: inherit;
      text-decoration: none;
    }
    .footer a:hover { text-decoration: underline; }

    /* ── Extract "thinking" indicator ── */
    .bubble-q.thinking {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--iq-text-muted);
    }
    .thinking-dots { display: inline-flex; gap: 4px; }
    .thinking-dots span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--iq-brand);
      opacity: 0.4;
      animation: iqThinking 1.2s infinite ease-in-out both;
    }
    .thinking-dots span:nth-child(2) { animation-delay: 0.15s; }
    .thinking-dots span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes iqThinking {
      0%, 80%, 100% { opacity: 0.4; transform: scale(0.85); }
      40% { opacity: 1; transform: scale(1); }
    }

    /* ── Responsive ── */
    @media (max-width: 480px) {
      :host { bottom: 12px; right: 12px; left: 12px; }
      .panel { width: auto; left: 0; right: 0; bottom: 68px; max-height: 75dvh; }
      .bubble { width: 52px; height: 52px; }
    }
  `;

  /** URL to GET the flow definition JSON; also the POST target for completed
   *  answers unless {@link submitUrl} is set. Forwarded to LLM verbs as `?dsl=`. */
  @property({ attribute: "url" }) url = "";

  /** Inline flow definition JSON string (skips the GET). */
  @property({ attribute: "json" }) flowJson = "";

  /** POST completed answers here. Empty → falls back to {@link url}. */
  @property({ attribute: "submit-to" }) submitUrl = "";

  /** Endpoint for LLM server verbs. Requests go to `{llmUrl}?verb=…&dsl=…`.
   *  When empty, LLM steps degrade to the manual-form fallback. */
  @property({ attribute: "llm-url" }) llmUrl = "";

  /** Client timeout (ms) for one LLM round-trip before falling back. */
  @property({ attribute: "llm-timeout", type: Number }) llmTimeout = 20000;

  /** Server-signed bearer token forwarded on every request (GET flow, POST
   *  answers, POST LLM). Falls back to the flow definition's `session.token`. */
  @property({ attribute: "auth" }) auth = "";

  /** How the copilot first opens: "click" | "auto" | "delay". */
  @property({ attribute: "trigger" }) trigger: TriggerMode = "click";

  /** Delay (ms) before auto-opening when `trigger` is "delay". */
  @property({ attribute: "trigger-delay", type: Number }) triggerDelay = 1000;

  /** Screen corner to anchor to (reflected so `:host([position])` CSS applies). */
  @property({ attribute: "position", reflect: true }) position: WidgetPosition =
    "bottom-right";

  /** Programmatic theme overrides, applied on top of the flow's `meta.theme`. */
  @property({ attribute: false }) themeOverrides?: ThemeOverrides;

  @state() private open = false;
  @state() private engine: FlowEngine | null = null;
  @state() private loading = true;
  @state() private error = "";
  @state() private inputValid = false;
  @state() private submitted = false;
  @state() private pulsed = true;
  @state() private debugOpen = false;
  @state() private highlightedJson = "";

  /** Bearer credential forwarded on every request. Resolves to the explicit
   *  `auth` token, else the flow definition's server-issued `session.token`. */
  private sessionToken = "";

  /** True once the visitor has clicked the launcher, so a delayed auto-open
   *  never fights a user who already opened or dismissed the panel. */
  private userInteracted = false;

  @query(".conversation") private conversationEl!: HTMLElement;

  connectedCallback() {
    super.connectedCallback();
    this.loadDefinition();
  }

  firstUpdated() {
    // Apply programmatic theme early so it survives a flow-load failure.
    applyThemeOverrides(this, this.themeOverrides);
    if (this.userInteracted) return;
    if (this.trigger === "auto") {
      this.openPanel();
    } else if (this.trigger === "delay") {
      window.setTimeout(() => {
        if (!this.userInteracted) this.openPanel();
      }, this.triggerDelay);
    }
  }

  private async loadDefinition() {
    try {
      let def: FlowDefinition;
      if (this.flowJson) {
        def = JSON.parse(this.flowJson);
      } else if (this.url) {
        const res = await fetch(this.url, {
          headers: this.authHeader(this.auth),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        def = await res.json();
      } else {
        throw new Error("Provide a url or json config");
      }
      this.engine = new FlowEngine(def);
      // Explicit auth token wins; otherwise use the server-issued session token.
      this.sessionToken = this.auth || def.session?.token || "";
      applyTheme(this, def);
      // Config theme overrides win over the flow's own theme.
      applyThemeOverrides(this, this.themeOverrides);
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Failed to load flow";
    } finally {
      this.loading = false;
    }
    // The flow may open directly on a server step.
    await this.maybeRunExtraction();
  }

  /** Bearer auth header for a token, or an empty object when there is none. */
  private authHeader(token: string): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  render() {
    return html`
      ${this.open ? this.renderPanel() : nothing}
      <button
        class="bubble ${this.pulsed ? "has-pulse" : ""}"
        @click=${this.togglePanel}
        aria-label=${this.open ? "Close questionnaire" : "Open questionnaire"}
      >
        ${this.open ? CLOSE_ICON : CHAT_ICON}
      </button>
    `;
  }

  private renderPanel() {
    const engine = this.engine;
    const meta = engine?.definition.meta;
    const progress = engine
      ? (engine.history.length / Math.max(engine.totalSteps, 1)) * 100
      : 0;

    const showDebug = import.meta.env.DEV && this.debugOpen && engine;

    return html`
      ${engine && showDebug ? this.renderDebugPanel(engine) : nothing}
      <div class="panel" @animationend=${this.onPanelAnimEnd}>
        <div class="header">
          ${
            meta?.brand?.logo
              ? html`
            <div class="header-logo"><img src=${meta.brand.logo} alt=${meta.brand.name ?? ""}/></div>
          `
              : nothing
          }
          <div class="header-text">
            <p class="header-title">${meta?.title ?? "Questionnaire"}</p>
            ${meta?.subtitle ? html`<p class="header-subtitle">${meta.subtitle}</p>` : nothing}
          </div>
          ${
            import.meta.env.DEV
              ? html`
            <button class="debug-btn" @click=${this.toggleDebug}
              title=${this.debugOpen ? "Hide state inspector" : "Show state inspector"}
              aria-label="Toggle debug panel">${BUG_ICON}</button>
          `
              : nothing
          }
          <button class="close-btn" @click=${this.togglePanel} aria-label="Close">${CLOSE_ICON}</button>
        </div>
        <div class="progress"><div class="progress-fill" style="width:${progress}%"></div></div>
        <div class="conversation">
          ${this.loading ? html`<p style="text-align:center;color:var(--iq-text-muted)">Loading...</p>` : nothing}
          ${this.error ? html`<p style="color:#dc2626">${this.error}</p>` : nothing}
          ${engine ? this.renderHistory(engine) : nothing}
          ${engine && !engine.finished ? this.renderCurrentQuestion(engine) : nothing}
          ${engine?.finished && !this.submitted ? this.renderComplete() : nothing}
          ${this.submitted ? this.renderSubmitted() : nothing}
        </div>
        <div class="footer"><a href="https://qualified.at" target="_blank" rel="noopener">Powered by Qualified.at</a></div>
      </div>
    `;
  }

  private renderDebugPanel(engine: FlowEngine) {
    const currentStep = engine.finished ? null : engine.currentStepId;

    return html`
      <div class="debug-panel">
        <div class="debug-header">
          <span class="debug-title">${BUG_ICON} POST payload</span>
          <span class="debug-meta">
            ${currentStep ? html`current: <code>${currentStep}</code> · ` : nothing}
            live · updates after each answer
          </span>
        </div>
        <pre class="debug-content"><code class="shj-lang-json">${
          this.highlightedJson ? unsafeHTML(this.highlightedJson) : "loading..."
        }</code></pre>
      </div>
    `;
  }

  private toggleDebug() {
    this.debugOpen = !this.debugOpen;
    if (this.debugOpen) this.refreshHighlight();
  }

  /** Re-highlight the engine state. Dynamic import keeps speed-highlight
   *  out of the production bundle entirely (Vite tree-shakes the dev branch). */
  private async refreshHighlight() {
    if (!import.meta.env.DEV) return;
    if (!this.debugOpen || !this.engine) return;
    const json = JSON.stringify(this.engine.toResult(), null, 2);
    const { highlightText } = await import("@speed-highlight/core");
    this.highlightedJson = await highlightText(json, "json", false);
  }

  protected updated(changed: PropertyValues) {
    if (import.meta.env.DEV && this.debugOpen && changed.has("debugOpen")) {
      this.refreshHighlight();
    }
  }

  private renderHistory(engine: FlowEngine) {
    return engine.history.map((entry) => this.renderHistoryEntry(entry));
  }

  private renderHistoryEntry(entry: HistoryEntry) {
    const step = entry.step;
    const verbClass = `msg-${step.verb}`;

    // Question bubble
    const questionText = step.question ?? step.text ?? "";
    const question = html`
      <div class="msg msg-q ${verbClass}">
        <div class="bubble-q">${questionText}</div>
      </div>
    `;

    // Answer bubble (only for collecting verbs)
    if (entry.answer !== undefined) {
      return html`
        ${question}
        <div class="msg msg-a">
          <div class="bubble-a">
            <span class="check">${CHECK_ICON}</span>
            ${this.formatAnswer(entry.answer, step)}
          </div>
        </div>
      `;
    }

    return question;
  }

  private renderCurrentQuestion(engine: FlowEngine) {
    const step = engine.currentStep;

    // Server-processing step: no input control — show a thinking indicator
    // while the widget round-trips (or advances past it on fallback).
    if (engine.currentStepIsExtract) {
      return this.renderThinking(step);
    }

    const questionText = step.question ?? step.text ?? "";
    const verbClass = `msg-${step.verb}`;

    const isDisplay =
      step.verb === "say" ||
      step.verb === "header" ||
      step.verb === "btw" ||
      step.verb === "warning";

    return html`
      <div class="msg msg-q ${verbClass}">
        <div class="bubble-q">${questionText}</div>
      </div>
      <div class="input-area">
        ${
          isDisplay
            ? html`<button class="continue-btn" @click=${this.handleContinue}>Continue</button>`
            : this.renderInputControl(step)
        }
      </div>
    `;
  }

  private renderInputControl(step: StepDefinition) {
    const type = step.verb === "confirm" ? "boolean" : step.type;

    switch (type) {
      case "enum":
        return html`<iq-enum-select
          .options=${step.options ?? []}
          @iq-submit=${this.handleSubmitInput}
        ></iq-enum-select>`;

      case "multi_enum":
        return html`
          <iq-multi-enum
            .options=${step.options ?? []}
            @iq-input=${() => {
              this.inputValid = true;
            }}
          ></iq-multi-enum>
          <button
            class="continue-btn"
            style="margin-top:10px"
            ?disabled=${!this.inputValid}
            @click=${this.handleSubmitInput}
          >Continue</button>
        `;

      case "boolean":
        return html`<iq-boolean-input
          @iq-submit=${this.handleSubmitInput}
        ></iq-boolean-input>`;

      case "integer":
      case "decimal":
      case "currency":
        return html`
          <div class="input-row">
            <iq-number-input
              type=${type}
              .value=${step.default != null ? Number(step.default) : null}
              @iq-submit=${this.handleSubmitInput}
              @iq-input=${() => {
                this.inputValid = true;
              }}
            ></iq-number-input>
            <button class="submit-btn" @click=${this.handleSubmitInput}>${SEND_ICON}</button>
          </div>
        `;

      case "text":
        return html`
          <iq-text-input
            type="text"
            @iq-input=${() => {
              this.inputValid = true;
            }}
          ></iq-text-input>
          <button
            class="continue-btn"
            style="margin-top:10px"
            @click=${this.handleSubmitInput}
          >Continue</button>
        `;

      default: // string, email, phone, date
        return html`
          <div class="input-row">
            <iq-text-input
              type=${type ?? "string"}
              @iq-submit=${this.handleSubmitInput}
              @iq-input=${() => {
                this.inputValid = true;
              }}
            ></iq-text-input>
            <button class="submit-btn" @click=${this.handleSubmitInput}>${SEND_ICON}</button>
          </div>
        `;
    }
  }

  private renderThinking(step: StepDefinition) {
    const label = step.thinking_label ?? "Thinking…";
    return html`
      <div class="msg msg-q msg-extract">
        <div class="bubble-q thinking">
          <span class="thinking-dots"><span></span><span></span><span></span></span>
          ${label}
        </div>
      </div>
    `;
  }

  private renderComplete() {
    return html`
      <div class="complete">
        <div class="complete-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <p class="complete-text">All done! Thank you for your responses.</p>
      </div>
    `;
  }

  private renderSubmitted() {
    return html`
      <div class="complete">
        <div class="complete-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <p class="complete-text">Your responses have been submitted. We'll be in touch!</p>
      </div>
    `;
  }

  /* ── Event handlers ── */

  private togglePanel() {
    this.userInteracted = true;
    this.pulsed = false;
    if (this.open) {
      // Trigger close animation
      const panel = this.shadowRoot?.querySelector(".panel");
      panel?.classList.add("closing");
    } else {
      this.openPanel();
    }
  }

  /** Open the panel (used by both the launcher click and auto/delay triggers). */
  private openPanel() {
    if (this.open) return;
    this.pulsed = false;
    this.open = true;
    this.updateComplete.then(() => this.scrollToBottom());
  }

  private onPanelAnimEnd(e: AnimationEvent) {
    if (e.animationName === "panelOut") this.open = false;
  }

  private async handleContinue() {
    this.engine?.acknowledge();
    this.afterAdvance();
    await this.maybeRunExtraction();
    this.autoSubmitIfComplete();
  }

  private async handleSubmitInput() {
    const engine = this.engine;
    if (!engine) return;

    const step = engine.currentStep;
    let value = this.extractValue(step);

    // Fall back to the step's default if the input is empty
    if (value === null || value === undefined) {
      if (step.default != null) value = step.default;
      else return;
    }
    if (typeof value === "string" && value.trim() === "") return;
    if (Array.isArray(value) && value.length === 0) return;

    engine.answer(value);
    this.afterAdvance();
    await this.maybeRunExtraction();
    this.autoSubmitIfComplete();
  }

  /** Shared UI refresh after the engine advances a step. */
  private afterAdvance() {
    this.inputValid = false;
    this.requestUpdate();
    this.updateComplete.then(() => this.scrollToBottom());
    this.refreshHighlight();
  }

  /**
   * Drive the LLM round-trip whenever the engine lands on a server step,
   * chaining through consecutive server verbs. All fetch/fallback logic lives
   * in {@link runServerVerb} (DOM-free, unit-tested); this method owns only the
   * spinner refresh between hops. The widget never sees or sends a prompt.
   */
  private async maybeRunExtraction(): Promise<void> {
    const engine = this.engine;
    if (!engine) return;

    while (!engine.finished && engine.currentStepIsExtract) {
      this.afterAdvance(); // show the thinking spinner
      await runServerVerb(engine, {
        llmUrl: this.llmUrl,
        dslUrl: this.url,
        auth: this.sessionToken,
        timeoutMs: this.llmTimeout,
      });
      this.afterAdvance(); // reflect the merged result / fallback
    }
  }

  private extractValue(step: StepDefinition): unknown {
    const type = step.verb === "confirm" ? "boolean" : step.type;
    const shadow = this.shadowRoot;
    if (!shadow) return null;

    switch (type) {
      case "enum":
        return (
          shadow.querySelector<IqEnumSelect>("iq-enum-select")?.getValue() ??
          null
        );
      case "multi_enum":
        return (
          shadow.querySelector<IqMultiEnum>("iq-multi-enum")?.getValue() ?? null
        );
      case "boolean":
        return (
          shadow
            .querySelector<IqBooleanInput>("iq-boolean-input")
            ?.getValue() ?? null
        );
      case "integer":
      case "decimal":
      case "currency":
        return (
          shadow.querySelector<IqNumberInput>("iq-number-input")?.getValue() ??
          null
        );
      default:
        return (
          shadow.querySelector<IqTextInput>("iq-text-input")?.getValue() ?? null
        );
    }
  }

  private async autoSubmitIfComplete() {
    const engine = this.engine;
    if (!engine?.finished) return;
    const target = this.submitUrl || this.url;
    if (this.submitted || !target) return;

    try {
      const res = await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeader(this.sessionToken),
        },
        body: JSON.stringify(engine.toResult()),
      });
      if (res.ok) this.submitted = true;
    } catch {
      // Silently fail — the complete screen is already shown
    }
  }

  private formatAnswer(answer: unknown, step: StepDefinition): string {
    if (typeof answer === "boolean") return answer ? "Yes" : "No";
    if (Array.isArray(answer)) {
      const opts = step.options as Option[] | undefined;
      if (opts) {
        return answer
          .map((v) => opts.find((o) => o.value === v)?.label ?? v)
          .join(", ");
      }
      return answer.join(", ");
    }
    if (step.type === "enum" && step.options) {
      const label = (step.options as Option[]).find(
        (o) => o.value === answer,
      )?.label;
      if (label) return label;
    }
    if (step.type === "currency" && typeof answer === "number") {
      return `$${answer.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    }
    return String(answer ?? "");
  }

  private scrollToBottom() {
    if (this.conversationEl) {
      this.conversationEl.scrollTop = this.conversationEl.scrollHeight;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "inquirex-widget": InquirexWidget;
  }
}
