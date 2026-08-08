// Typed `fetch` doubles.
//
// `vi.fn(async () => body)` infers a zero-argument signature, which makes
// `mock.calls[0][1]` a type error and quietly gives up checking anything about
// the request. Declaring the parameters once here keeps every assertion about
// a URL, a header or a POST body type-checked at the call site.

import { vi } from "vitest";

/** The part of `Response` the widget actually touches. */
export interface StubResponse {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
}

/**
 * A `fetch` double driven by `impl`, with a typed call log.
 *
 * @param impl what to answer for a given request
 */
export function fetchStub(
  impl: (
    url: string,
    init?: RequestInit,
  ) => StubResponse | Promise<StubResponse>,
) {
  return vi.fn(
    async (url: string, init?: RequestInit) =>
      (await impl(url, init)) as unknown as Response,
  );
}

/** Answer every request with the same JSON body. */
export function jsonFetch(body: unknown, ok = true, status = 200) {
  return fetchStub(() => ({ ok, status, json: async () => body }));
}

/** Refuse every request the way a network failure would. */
export function failingFetch(message: string) {
  return vi.fn(async (_url: string, _init?: RequestInit): Promise<Response> => {
    throw new Error(message);
  });
}

/**
 * A stub that fails loudly if anything calls it — the default for suites that
 * must not reach the network.
 */
export function forbiddenFetch() {
  return failingFetch("unexpected network call");
}

/**
 * A double shaped for `ServerVerbConfig.fetchFn`, which is declared as
 * `typeof fetch` and so must accept a `Request` or `URL` as well as a string.
 * Under `strictFunctionTypes` a narrower parameter is not assignable, so the
 * widening happens here rather than as a cast at each call site.
 */
export function serverFetch(
  impl: (
    url: string,
    init: RequestInit,
  ) => StubResponse | Promise<StubResponse>,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) =>
    (await impl(
      String(input),
      init ?? {},
    )) as unknown as Response) as typeof fetch;
}
