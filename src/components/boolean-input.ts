import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

@customElement("iq-boolean-input")
export class IqBooleanInput extends LitElement {
  static styles = css`
    :host { display: block; }
    .buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    button {
      font-family: inherit;
      font-size: 15px;
      font-weight: 500;
      padding: 12px 16px;
      border: 1.5px solid var(--iq-border, #d4d4d8);
      border-radius: 10px;
      background: var(--iq-surface, #fff);
      color: var(--iq-text, #1a1a1a);
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s, transform 0.1s;
      user-select: none;
    }
    button:hover {
      border-color: color-mix(in srgb, var(--iq-brand, #2563eb) 50%, var(--iq-border, #d4d4d8));
      background: color-mix(in srgb, var(--iq-brand, #2563eb) 4%, var(--iq-surface, #fff));
    }
    button:active { transform: scale(0.97); }
    button[data-selected] {
      border-color: var(--iq-brand, #2563eb);
      background: color-mix(in srgb, var(--iq-brand, #2563eb) 10%, var(--iq-surface, #fff));
      color: var(--iq-brand, #2563eb);
      font-weight: 600;
    }
  `;

  @state() private selected: boolean | null = null;

  render() {
    return html`
      <div class="buttons">
        <button
          ?data-selected=${this.selected === true}
          @click=${() => this.select(true)}
        >Yes</button>
        <button
          ?data-selected=${this.selected === false}
          @click=${() => this.select(false)}
        >No</button>
      </div>
    `;
  }

  getValue(): boolean | null { return this.selected; }

  private select(value: boolean) {
    this.selected = value;
    this.dispatchEvent(new CustomEvent("iq-input", { detail: value }));
    setTimeout(() => this.dispatchEvent(new CustomEvent("iq-submit")), 200);
  }
}

declare global {
  interface HTMLElementTagNameMap { "iq-boolean-input": IqBooleanInput; }
}
