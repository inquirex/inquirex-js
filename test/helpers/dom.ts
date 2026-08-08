// Shared helpers for the DOM-backed suites (components, widget, print, entry).
//
// Every one of these exists because a custom element's lifecycle is
// asynchronous in two different ways — lit batches renders on a microtask, and
// the widget awaits fetches between them — and a test that forgets either gets
// a false pass on an element that never rendered.

/** An element that has been through at least one lit render cycle. */
interface Updatable extends HTMLElement {
  updateComplete: Promise<boolean>;
}

const mounted: HTMLElement[] = [];

/**
 * Create an element, apply properties, attach it, and await its first render.
 *
 * Properties are assigned *before* attaching so `connectedCallback` sees them —
 * `iq-number-input` reads `type` there to set its currency attribute, and the
 * widget reads `origins` to decide whether to run at all.
 */
export async function mountElement<T extends HTMLElement>(
  tag: string,
  props: Partial<T> = {},
): Promise<T> {
  const el = document.createElement(tag) as T;
  Object.assign(el, props);
  document.body.appendChild(el);
  mounted.push(el);
  await settle(el);
  return el;
}

/** Remove everything {@link mountElement} attached. Call from afterEach. */
export function unmountAll(): void {
  for (const el of mounted.splice(0)) el.remove();
}

/** Await an element's pending lit render, if it is a lit element. */
export async function settle(el: HTMLElement): Promise<void> {
  const updatable = el as Partial<Updatable>;
  if (updatable.updateComplete) await updatable.updateComplete;
}

/**
 * Let queued microtasks *and* already-elapsed timers run, then await the
 * element's render. The widget chains `await fetch → engine → requestUpdate`,
 * so a single `updateComplete` observes the state before the chain resolves.
 */
export async function flush(el?: HTMLElement, ticks = 4): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    await Promise.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (el) await settle(el);
  }
}

/**
 * Drain queued microtasks and awaits without touching the clock.
 *
 * The timer-free counterpart to {@link flush}, for tests running on fake
 * timers — where a `setTimeout(0)` would never resolve.
 */
export async function microflush(el?: HTMLElement, ticks = 6): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    await Promise.resolve();
    if (el) await settle(el);
  }
}

/**
 * Wait out a real timer, then let the element re-render.
 *
 * `iq-enum-select` and `iq-boolean-input` defer their auto-submit by 200ms so
 * the visitor sees their choice highlight before the question is replaced.
 */
export async function waitFor(ms: number, el?: HTMLElement): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
  await flush(el);
}

/** Query the shadow root, failing loudly rather than returning null. */
export function shadowQuery<T extends Element>(
  host: HTMLElement,
  selector: string,
): T {
  const found = host.shadowRoot?.querySelector<T>(selector);
  if (!found) {
    throw new Error(
      `no ${selector} in <${host.localName}>: ${host.shadowRoot?.innerHTML ?? "(no shadow root)"}`,
    );
  }
  return found;
}

/** All matches in the shadow root, as a real array. */
export function shadowQueryAll<T extends Element>(
  host: HTMLElement,
  selector: string,
): T[] {
  return Array.from(host.shadowRoot?.querySelectorAll<T>(selector) ?? []);
}

/** The shadow root's markup — used in assertion messages and text checks. */
export function shadowHtml(host: HTMLElement): string {
  return host.shadowRoot?.innerHTML ?? "";
}

/** Record every occurrence of a custom event on an element. */
export function captureEvents(
  el: HTMLElement,
  type: string,
): Array<CustomEvent["detail"]> {
  const seen: Array<CustomEvent["detail"]> = [];
  el.addEventListener(type, (e) => seen.push((e as CustomEvent).detail));
  return seen;
}

/** Type text into an input/textarea and fire the `input` event lit listens for. */
export function typeInto(
  field: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Dispatch a keydown the components' handlers will see. */
export function pressKey(el: Element, key: string): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}
