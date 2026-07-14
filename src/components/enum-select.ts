import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { Option } from "../types.js";

@customElement("iq-enum-select")
export class IqEnumSelect extends LitElement {
  static styles = css`
    :host { display: block; }
    .options { display: flex; flex-direction: column; gap: 8px; }
    .option {
      display: flex; align-items: center; gap: 10px;
      padding: 11px 14px;
      border: 1.5px solid var(--iq-border, #d4d4d8);
      border-radius: 10px;
      background: var(--iq-surface, #fff);
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s, transform 0.1s;
      font-size: 15px;
      color: var(--iq-text, #1a1a1a);
      user-select: none;
    }
    .option:hover {
      border-color: color-mix(in srgb, var(--iq-highlight, #2563eb) 50%, var(--iq-border, #d4d4d8));
      background: color-mix(in srgb, var(--iq-highlight, #2563eb) 4%, var(--iq-surface, #fff));
    }
    .option:active { transform: scale(0.98); }
    .option[data-selected] {
      border-color: var(--iq-highlight, #2563eb);
      background: color-mix(in srgb, var(--iq-highlight, #2563eb) 8%, var(--iq-surface, #fff));
    }
    .radio {
      width: 18px; height: 18px;
      border: 2px solid var(--iq-border, #d4d4d8);
      border-radius: 50%;
      flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: border-color 0.15s;
    }
    .option[data-selected] .radio {
      border-color: var(--iq-highlight, #2563eb);
    }
    .radio-dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      background: var(--iq-highlight, #2563eb);
      transform: scale(0);
      transition: transform 0.15s ease;
    }
    .option[data-selected] .radio-dot { transform: scale(1); }
    .label { flex: 1; }
  `;

  @property({ type: Array }) options: Option[] = [];
  @state() private selected: string | null = null;

  render() {
    return html`
      <div class="options" role="radiogroup">
        ${this.options.map(
          (opt) => html`
            <div
              class="option"
              role="radio"
              aria-checked=${this.selected === opt.value}
              ?data-selected=${this.selected === opt.value}
              @click=${() => this.select(opt.value)}
            >
              <div class="radio"><div class="radio-dot"></div></div>
              <span class="label">${opt.label}</span>
            </div>
          `,
        )}
      </div>
    `;
  }

  getValue(): string | null {
    return this.selected;
  }

  private select(value: string) {
    this.selected = value;
    this.dispatchEvent(new CustomEvent("iq-input", { detail: value }));
    // Auto-submit on selection for single-choice
    setTimeout(() => this.dispatchEvent(new CustomEvent("iq-submit")), 200);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "iq-enum-select": IqEnumSelect;
  }
}
