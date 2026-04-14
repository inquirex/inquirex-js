import { LitElement, html, css } from "lit";
import { customElement, property, query } from "lit/decorators.js";

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
      -moz-appearance: textfield;
    }
    input::-webkit-inner-spin-button,
    input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    :host([currency]) input {
      border-radius: 0 10px 10px 0;
    }
    input:focus {
      border-color: var(--iq-brand, #2563eb);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--iq-brand, #2563eb) 15%, transparent);
    }
    :host([currency]) input:focus ~ .prefix,
    :host([currency]) .prefix { border-color: var(--iq-brand, #2563eb); }
    input::placeholder { color: var(--iq-text-muted, #a1a1aa); }
  `;

  @property() type: "integer" | "decimal" | "currency" = "integer";
  @property({ type: Number }) value: number | null = null;
  @property() placeholder = "";

  @query("input") private inputEl!: HTMLInputElement;

  render() {
    const isCurrency = this.type === "currency";
    return html`
      <div class="field">
        ${isCurrency ? html`<span class="prefix">$</span>` : null}
        <input
          type="number"
          .value=${this.value?.toString() ?? ""}
          placeholder=${this.placeholder || (isCurrency ? "0.00" : "0")}
          step=${this.type === "integer" ? "1" : "0.01"}
          @input=${this.handleInput}
          @keydown=${this.handleKeydown}
        />
      </div>
    `;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.type === "currency") this.setAttribute("currency", "");
  }

  focus() { this.updateComplete.then(() => this.inputEl?.focus()); }

  getValue(): number | null {
    const raw = this.inputEl?.value;
    if (!raw || raw.trim() === "") return null;
    return this.type === "integer" ? parseInt(raw, 10) : parseFloat(raw);
  }

  private handleInput() {
    this.dispatchEvent(new CustomEvent("iq-input", { detail: this.getValue() }));
  }

  private handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      this.dispatchEvent(new CustomEvent("iq-submit"));
    }
  }
}

declare global {
  interface HTMLElementTagNameMap { "iq-number-input": IqNumberInput; }
}
