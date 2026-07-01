import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEurRate } from "../rates";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchEurRate", () => {
  it("returns 1 for EUR without hitting the network", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof globalThis.fetch;
    const r = await fetchEurRate("EUR");
    expect(r).toEqual({ ok: true, rate: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns frankfurter rate on a happy path (no fallback)", async () => {
    const spy = vi.fn((url: string) =>
      url.includes("frankfurter")
        ? Promise.resolve(
            jsonResponse({
              amount: 1,
              base: "EUR",
              date: "2026-07-01",
              rates: { USD: 1.0823 },
            }),
          )
        : Promise.reject(new Error("fallback should not be hit")),
    );
    globalThis.fetch = spy as unknown as typeof globalThis.fetch;

    const r = await fetchEurRate("USD");
    expect(r).toEqual({ ok: true, rate: 1.0823 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("falls back to open.er-api when frankfurter throws", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn((url: string) => {
      calls.push(url);
      if (url.includes("frankfurter")) return Promise.reject(new Error("net"));
      return Promise.resolve(
        jsonResponse({
          result: "success",
          base_code: "EUR",
          rates: { USD: 1.09 },
        }),
      );
    }) as unknown as typeof globalThis.fetch;

    const r = await fetchEurRate("USD");
    expect(r).toEqual({ ok: true, rate: 1.09 });
    expect(calls).toHaveLength(2);
  });

  it("falls back when frankfurter responds with a non-OK status", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn((url: string) => {
      calls.push(url);
      if (url.includes("frankfurter"))
        return Promise.resolve(jsonResponse({ message: "boom" }, 500));
      return Promise.resolve(
        jsonResponse({
          result: "success",
          base_code: "EUR",
          rates: { USD: 1.09 },
        }),
      );
    }) as unknown as typeof globalThis.fetch;

    const r = await fetchEurRate("USD");
    expect(r).toEqual({ ok: true, rate: 1.09 });
    expect(calls).toHaveLength(2);
  });

  it("returns failure when both providers fail (no further retries)", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn((url: string) => {
      calls.push(url);
      return Promise.reject(new Error("offline"));
    }) as unknown as typeof globalThis.fetch;

    const r = await fetchEurRate("USD");
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("does not duplicate the primary call on success", async () => {
    const spy = vi.fn((_url: string) =>
      Promise.resolve(
        jsonResponse({
          amount: 1,
          base: "EUR",
          date: "2026-07-01",
          rates: { USD: 1.08 },
        }),
      ),
    );
    globalThis.fetch = spy as unknown as typeof globalThis.fetch;

    await fetchEurRate("USD");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("uppercases the currency before lookup", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn((url: string) => {
      calls.push(url);
      return Promise.resolve(
        jsonResponse({
          amount: 1,
          base: "EUR",
          date: "2026-07-01",
          rates: { GBP: 0.84 },
        }),
      );
    }) as unknown as typeof globalThis.fetch;

    const r = await fetchEurRate("gbp");
    expect(r).toEqual({ ok: true, rate: 0.84 });
    expect(calls[0]).toContain("to=GBP");
  });
});
