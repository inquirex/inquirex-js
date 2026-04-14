import { LitElement, html, css } from "lit";
import { customElement, property, query } from "lit/decorators.js";

@customElement("iq-text-input")
export class IqTextInput extends LitElement {
  static styles = css`
    :host { display: block; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    input, textarea {
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
    input:focus, textarea:focus {
      border-color: var(--iq-brand, #2563eb);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--iq-brand, #2563eb) 15%, transparent);
    }
    input::placeholder, textarea::placeholder {
      color: var(--iq-text-muted, #a1a1aa);
    }
    textarea { resize: vertical; min-height: 80px; }
  `;

  @property() type: "string" | "text" | "email" | "phone" | "date" = "string";
  @property() placeholder = "";
  @property() value = "";

  @query("input, textarea") private inputEl!: HTMLInputElement | HTMLTextAreaElement;

  private get inputType(): string {
    switch (this.type) {
      case "email": return "email";
      case "phone": return "tel";
      case "date": return "date";
      default: return "text";
    }
  }

  render() {
    if (this.type === "text") {
      return html`
        <div class="field">
          <textarea
            .value=${this.value}
            placeholder=${this.placeholder || "Type your answer..."}
            @input=${this.handleInput}
            @keydown=${this.handleKeydown}
          ></textarea>
        </div>
      `;
    }
    return html`
      <div class="field">
        <input
          type=${this.inputType}
          .value=${this.value}
          placeholder=${this.placeholder || "Type your answer..."}
          @input=${this.handleInput}
          @keydown=${this.handleKeydown}
        />
      </div>
    `;
  }

  focus() { this.updateComplete.then(() => this.inputEl?.focus()); }

  getValue(): string { return this.inputEl?.value?.trim() ?? ""; }

  private handleInput() {
    this.dispatchEvent(new CustomEvent("iq-input", { detail: this.inputEl.value }));
  }

  private handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && this.type !== "text") {
      e.preventDefault();
      this.dispatchEvent(new CustomEvent("iq-submit"));
    }
  }
}

declare global {
  interface HTMLElementTagNameMap { "iq-text-input": IqTextInput; }
}
