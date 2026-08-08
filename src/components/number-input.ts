import { LitElement, html, css } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

@customElement("iq-number-input")
export class IqNumberInput extends LitElement {
  static styles = css`
    :host { display: block; }
    .field { display: flex; align-items: center; gap: 0; }
    .prefix {
      font-family: inherit;
      font-size: 15px;
      padding: 12px 0 12px 14px;
      border: 1.5px solid var(--iq-border, #d4d4d8);
      border-right: none;
      border-radius: 10px 0 0 10px;
      background: var(--iq-surface, #fff);
      color: var(--iq-text-muted, #a1a1aa);
      line-height: 1;
    }
    input {
      font-family: inherit;
      font-size: 15px;
      padding: 12px 14px;
      border: 1.5px solid var(--iq-border, #d4d4d8);
      border-radius: 10px;
      background: var(--iq-surface, #fff);
      color: var(--iq-text, #1a1a1a);
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
      width: 100%;
      box-sizing: border-box;
    }
    /* Show the native stepper arrows. WebKit reveals them only on hover/focus
       by default, which makes a numeric field look like a plain text box until
       you touch it; opacity:1 keeps them visible so the field advertises that
       it steps. Firefox shows them whenever the input is not
       -moz-appearance:textfield, so it needs no rule of its own. */
    input::-webkit-inner-spin-button,
    input::-webkit-outer-spin-button {
      opacity: 1;
      height: 24px;
    }
    /* Out-of-range is a native pseudo-class driven by min/max, so the warning
       state costs no JavaScript. It fires only once the value actually leaves
       the bounds, unlike :invalid, which also matches a half-typed number. */
    input:out-of-range {
      border-color: var(--iq-danger, #dc2626);
    }
    input:out-of-range:focus {
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--iq-danger, #dc2626) 15%, transparent);
    }
    .range-hint {
      font-size: 12px;
      color: var(--iq-danger, #dc2626);
      margin: 6px 0 0;
    }
    :host([currency]) input {
      border-radius: 0 10px 10px 0;
    }
    input:focus {
      border-color: var(--iq-highlight, #2563eb);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--iq-highlight, #2563eb) 15%, transparent);
    }
    :host([currency]) input:focus ~ .prefix,
    :host([currency]) .prefix { border-color: var(--iq-highlight, #2563eb); }
    input::placeholder { color: var(--iq-text-muted, #a1a1aa); }
  `;

  @property() type: "integer" | "decimal" | "currency" = "integer";
  @property({ type: Number }) value: number | null = null;
  @property() placeholder = "";

  /** Inclusive lower bound. `null` leaves the field unbounded below. */
  @property({ type: Number }) min: number | null = null;

  /** Inclusive upper bound. `null` leaves the field unbounded above. */
  @property({ type: Number }) max: number | null = null;

  /** Stepper increment. Defaults to 1 for integers, 0.01 otherwise. */
  @property({ type: Number }) step: number | null = null;

  /** True while the typed value sits outside [min, max]. Drives the hint only —
   *  the binding guarantee is {@link getValue}, which clamps regardless. */
  @state() private outOfRange = false;

  @query("input") private inputEl!: HTMLInputElement;

  /** The increment handed to the input, so integers step by whole numbers. */
  private get stepAttr(): number {
    return this.step ?? (this.type === "integer" ? 1 : 0.01);
  }

  render() {
    const isCurrency = this.type === "currency";
    return html`
      <div class="field">
        ${isCurrency ? html`<span class="prefix">$</span>` : null}
        <input
          type="number"
          .value=${this.value?.toString() ?? ""}
          placeholder=${this.placeholder || (isCurrency ? "0.00" : "0")}
          min=${ifDefined(this.min ?? undefined)}
          max=${ifDefined(this.max ?? undefined)}
          step=${this.stepAttr}
          @input=${this.handleInput}
          @change=${this.handleChange}
          @keydown=${this.handleKeydown}
        />
      </div>
      ${this.outOfRange ? html`<p class="range-hint">${this.rangeHint()}</p>` : null}
    `;
  }

  /** Human-readable statement of the bound that is currently being violated. */
  private rangeHint(): string {
    if (this.min != null && this.max != null) {
      return `Enter a number between ${this.min} and ${this.max}.`;
    }
    if (this.min != null) return `Enter ${this.min} or more.`;
    return `Enter ${this.max} or less.`;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.type === "currency") this.setAttribute("currency", "");
  }

  focus() {
    this.updateComplete.then(() => this.inputEl?.focus());
  }

  /**
   * The current value, clamped into [min, max].
   *
   * The clamp lives here rather than only on the element because `min`/`max`
   * on an `<input type="number">` bound the *stepper arrows* and flip
   * `:out-of-range`, but do nothing to stop a user typing or pasting 900 into
   * a 1–10 field. This is the single point every caller reads through, so it
   * is the only place the bound can actually be guaranteed.
   *
   * @returns the clamped number, or null when the field is empty or unparseable
   */
  getValue(): number | null {
    const raw = this.inputEl?.value;
    if (!raw || raw.trim() === "") return null;
    const parsed =
      this.type === "integer" ? parseInt(raw, 10) : parseFloat(raw);
    if (Number.isNaN(parsed)) return null;
    return this.clamp(parsed);
  }

  /** Pull a number back inside [min, max]. Unbounded ends are left alone. */
  private clamp(n: number): number {
    let v = n;
    if (this.min != null && v < this.min) v = this.min;
    if (this.max != null && v > this.max) v = this.max;
    return v;
  }

  /** Whether the raw text currently in the field falls outside the bounds. */
  private isOutOfRange(): boolean {
    const raw = this.inputEl?.value;
    if (!raw || raw.trim() === "") return false;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return false;
    return parsed !== this.clamp(parsed);
  }

  private handleInput() {
    // While typing, only warn. Rewriting the field mid-keystroke would fight
    // the user — typing "15" into a max-20 field passes through "1", and
    // snapping that to the minimum would make the field impossible to fill.
    this.outOfRange = this.isOutOfRange();
    this.dispatchEvent(
      new CustomEvent("iq-input", { detail: this.getValue() }),
    );
  }

  /**
   * Commit the clamp visibly. `change` fires on blur and on every stepper
   * click, which is the point the user has finished expressing a number — so
   * correcting it here shows them what was stored instead of silently
   * substituting a different value at submit time.
   */
  private handleChange() {
    const committed = this.getValue();
    if (committed !== null && this.inputEl) {
      this.inputEl.value = committed.toString();
    }
    this.outOfRange = this.isOutOfRange();
    this.dispatchEvent(new CustomEvent("iq-input", { detail: committed }));
  }

  private handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      this.dispatchEvent(new CustomEvent("iq-submit"));
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "iq-number-input": IqNumberInput;
  }
}
