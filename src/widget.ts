import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";
import { FlowEngine } from "./engine.js";
import type { FlowDefinition, StepDefinition, HistoryEntry, Option } from "./types.js";

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

@customElement("inquirex-widget")
export class InquirexWidget extends LitElement {
  static styles = css`
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');

    :host {
      --iq-brand: #2563eb;
      --iq-brand-dark: color-mix(in srgb, var(--iq-brand) 85%, #000);
      --iq-bg: #f8f7f4;
      --iq-surface: #ffffff;
      --iq-text: #1c1917;
      --iq-text-muted: #78716c;
      --iq-border: #e7e5e4;
      --iq-radius: 18px;
      --iq-font: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;

      font-family: var(--iq-font);
      font-size: 15px;
      line-height: 1.5;
      color: var(--iq-text);
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
    }

    /* ── Floating trigger bubble ── */
    .bubble {
      width: 60px; height: 60px;
      border-radius: 50%;
      background: var(--iq-brand);
      color: #fff;
      border: none;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow:
        0 4px 20px color-mix(in srgb, var(--iq-brand) 35%, transparent),
        0 2px 8px rgba(0,0,0,0.08);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      position: relative;
    }
    .bubble:hover {
      transform: scale(1.08);
      box-shadow:
        0 6px 28px color-mix(in srgb, var(--iq-brand) 45%, transparent),
        0 2px 8px rgba(0,0,0,0.1);
    }
    .bubble:active { transform: scale(0.95); }
    .bubble.has-pulse::after {
      content: '';
      position: absolute; inset: -4px;
      border-radius: 50%;
      border: 2px solid var(--iq-brand);
      animation: pulse 2s ease-out infinite;
    }
    @keyframes pulse {
      0% { transform: scale(1); opacity: 0.6; }
      100% { transform: scale(1.4); opacity: 0; }
    }

    /* ── Panel container ── */
    .panel {
      position: absolute;
      bottom: 72px; right: 0;
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

    /* ── Header ── */
    .header {
      background: linear-gradient(135deg, var(--iq-brand), var(--iq-brand-dark));
      color: #fff;
      padding: 20px 20px 18px;
      position: relative;
    }
    .header-title {
      font-size: 18px; font-weight: 700;
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
      background: rgba(255,255,255,0.15);
      border: none; color: #fff;
      width: 32px; height: 32px;
      border-radius: 8px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
    }
    .close-btn:hover { background: rgba(255,255,255,0.25); }

    /* ── Progress bar ── */
    .progress {
      height: 3px;
      background: rgba(255,255,255,0.15);
    }
    .progress-fill {
      height: 100%;
      background: rgba(255,255,255,0.7);
      transition: width 0.4s ease;
      border-radius: 0 2px 2px 0;
    }

    /* ── Conversation area ── */
    .conversation {
      flex: 1;
      overflow-y: auto;
      padding: 16px 16px 8px;
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
      background: var(--iq-surface);
      padding: 12px 16px;
      border-radius: 14px 14px 14px 4px;
      font-size: 15px;
      line-height: 1.5;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .bubble-a {
      background: var(--iq-brand);
      color: #fff;
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
      padding: 12px 16px 16px;
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
      color: #fff;
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
      color: #fff;
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

    /* ── Responsive ── */
    @media (max-width: 480px) {
      :host { bottom: 12px; right: 12px; left: 12px; }
      .panel { width: auto; left: 0; right: 0; bottom: 68px; max-height: 75dvh; }
      .bubble { width: 52px; height: 52px; }
    }
  `;

  /** URL to fetch the flow definition JSON. */
  @property({ attribute: "flow-url" }) flowUrl = "";

  /** Inline JSON string (alternative to flow-url). */
  @property({ attribute: "flow-json" }) flowJson = "";


  @state() private open = false;
  @state() private engine: FlowEngine | null = null;
  @state() private loading = true;
  @state() private error = "";
  @state() private inputValid = false;
  @state() private submitted = false;
  @state() private pulsed = true;

  @query(".conversation") private conversationEl!: HTMLElement;

  connectedCallback() {
    super.connectedCallback();
    this.loadDefinition();
  }

  private async loadDefinition() {
    try {
      let def: FlowDefinition;
      if (this.flowJson) {
        def = JSON.parse(this.flowJson);
      } else if (this.flowUrl) {
        const res = await fetch(this.flowUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        def = await res.json();
      } else {
        throw new Error("Provide flow-url or flow-json attribute");
      }
      this.engine = new FlowEngine(def);
      if (def.meta?.brand?.color) {
        this.style.setProperty("--iq-brand", def.meta.brand.color);
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Failed to load flow";
    } finally {
      this.loading = false;
    }
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

    return html`
      <div class="panel" @animationend=${this.onPanelAnimEnd}>
        <div class="header">
          <p class="header-title">${meta?.title ?? "Questionnaire"}</p>
          ${meta?.subtitle ? html`<p class="header-subtitle">${meta.subtitle}</p>` : nothing}
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
    const questionText = step.question ?? step.text ?? "";
    const verbClass = `msg-${step.verb}`;

    const isDisplay = step.verb === "say" || step.verb === "header" || step.verb === "btw" || step.verb === "warning";

    return html`
      <div class="msg msg-q ${verbClass}">
        <div class="bubble-q">${questionText}</div>
      </div>
      <div class="input-area">
        ${isDisplay
          ? html`<button class="continue-btn" @click=${this.handleContinue}>Continue</button>`
          : this.renderInputControl(step)}
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
            @iq-input=${() => { this.inputValid = true; }}
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
              @iq-input=${() => { this.inputValid = true; }}
            ></iq-number-input>
            <button class="submit-btn" @click=${this.handleSubmitInput}>${SEND_ICON}</button>
          </div>
        `;

      case "text":
        return html`
          <iq-text-input
            type="text"
            @iq-input=${() => { this.inputValid = true; }}
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
              @iq-input=${() => { this.inputValid = true; }}
            ></iq-text-input>
            <button class="submit-btn" @click=${this.handleSubmitInput}>${SEND_ICON}</button>
          </div>
        `;
    }
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
    this.pulsed = false;
    if (this.open) {
      // Trigger close animation
      const panel = this.shadowRoot?.querySelector(".panel");
      panel?.classList.add("closing");
    } else {
      this.open = true;
      this.updateComplete.then(() => this.scrollToBottom());
    }
  }

  private onPanelAnimEnd(e: AnimationEvent) {
    if (e.animationName === "panelOut") this.open = false;
  }

  private handleContinue() {
    this.engine?.acknowledge();
    this.inputValid = false;
    this.requestUpdate();
    this.updateComplete.then(() => this.scrollToBottom());
    this.autoSubmitIfComplete();
  }

  private handleSubmitInput() {
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
    this.inputValid = false;
    this.requestUpdate();
    this.updateComplete.then(() => this.scrollToBottom());
    this.autoSubmitIfComplete();
  }

  private extractValue(step: StepDefinition): unknown {
    const type = step.verb === "confirm" ? "boolean" : step.type;
    const shadow = this.shadowRoot;
    if (!shadow) return null;

    switch (type) {
      case "enum":
        return shadow.querySelector<IqEnumSelect>("iq-enum-select")?.getValue() ?? null;
      case "multi_enum":
        return shadow.querySelector<IqMultiEnum>("iq-multi-enum")?.getValue() ?? null;
      case "boolean":
        return shadow.querySelector<IqBooleanInput>("iq-boolean-input")?.getValue() ?? null;
      case "integer":
      case "decimal":
      case "currency":
        return shadow.querySelector<IqNumberInput>("iq-number-input")?.getValue() ?? null;
      default:
        return shadow.querySelector<IqTextInput>("iq-text-input")?.getValue() ?? null;
    }
  }

  private async autoSubmitIfComplete() {
    const engine = this.engine;
    if (!engine?.finished) return;
    if (this.submitted || !this.flowUrl) return;

    try {
      const res = await fetch(this.flowUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

/* ── Auto-init from <script> tag attributes ── */

function autoInit() {
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script) return;

  const flowUrl = script.getAttribute("data-flow-url");
  const flowJson = script.getAttribute("data-flow-json");
  const siteId = script.getAttribute("data-site-id");

  if (!flowUrl && !flowJson && !siteId) return;

  const widget = document.createElement("inquirex-widget");
  if (flowUrl) widget.setAttribute("flow-url", flowUrl);
  else if (siteId) widget.setAttribute("flow-url", `https://qualified.at/api/flows/${siteId}`);
  if (flowJson) widget.setAttribute("flow-json", flowJson);
  document.body.appendChild(widget);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", autoInit);
} else {
  autoInit();
}

declare global {
  interface HTMLElementTagNameMap { "inquirex-widget": InquirexWidget; }
}
