import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { Option } from "../types.js";

@customElement("iq-multi-enum")
export class IqMultiEnum extends LitElement {
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
    .checkbox {
      width: 18px; height: 18px;
      border: 2px solid var(--iq-border, #d4d4d8);
      border-radius: 5px;
      flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: border-color 0.15s, background 0.15s;
    }
    .option[data-selected] .checkbox {
      border-color: var(--iq-highlight, #2563eb);
      background: var(--iq-highlight, #2563eb);
    }
    .check-icon {
      opacity: 0;
      transition: opacity 0.15s;
    }
    .option[data-selected] .check-icon { opacity: 1; }
    .label { flex: 1; }
  `;

  @property({ type: Array }) options: Option[] = [];
  @state() private selected: Set<string> = new Set();

  render() {
    return html`
      <div class="options" role="group">
        ${this.options.map(
          (opt) => html`
            <div
              class="option"
              role="checkbox"
              aria-checked=${this.selected.has(opt.value)}
              ?data-selected=${this.selected.has(opt.value)}
              @click=${() => this.toggle(opt.value)}
            >
              <div class="checkbox">
                <svg class="check-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <span class="label">${opt.label}</span>
            </div>
          `,
        )}
      </div>
    `;
  }

  getValue(): string[] {
    return [...this.selected];
  }

  private toggle(value: string) {
    const next = new Set(this.selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    this.selected = next;
    this.dispatchEvent(new CustomEvent("iq-input", { detail: [...next] }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "iq-multi-enum": IqMultiEnum;
  }
}
