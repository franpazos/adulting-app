/**
 * Tests for the Sheets API wrapper. Two surfaces:
 *
 *   1. Batching primitives (batchGetValues, batchUpdateValues,
 *      batchClearValues, addSheets): verify the HTTP request shape and
 *      parsing of responses so we can't silently drift from the Sheets
 *      API contract.
 *
 *   2. Retry-with-backoff on 429 / 5xx in authorizedFetch (exercised
 *      indirectly via getValues): verify the call count, that retries
 *      eventually succeed, and that non-retryable statuses fail fast.
 *
 * `getValidToken` is mocked at module level so we don't pull in the
 * actual OAuth flow. `global.fetch` is replaced per test. The retry-loop
 * `sleep` is replaced with a no-op so tests don't pay the real backoff.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/google/auth", () => ({
  getValidToken: vi.fn(async () => "test-token"),
}));

import {
  _internal,
  addSheets,
  batchClearValues,
  batchGetValues,
  batchUpdateValues,
  getValues,
  SheetsApiError,
} from "@/lib/google/sheets-api";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function errorResponse(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: "Error",
    headers: { "Content-Type": "application/json", ...headers },
  });
}

const realSleep = _internal._impl.sleep;

beforeEach(() => {
  _internal._impl.sleep = vi.fn(async () => {});
});

afterEach(() => {
  _internal._impl.sleep = realSleep;
  vi.restoreAllMocks();
});

describe("retry helpers", () => {
  it("shouldRetry: 429 and 5xx yes, 4xx (other) no, 2xx no", () => {
    expect(_internal.shouldRetry(429)).toBe(true);
    expect(_internal.shouldRetry(500)).toBe(true);
    expect(_internal.shouldRetry(503)).toBe(true);
    expect(_internal.shouldRetry(599)).toBe(true);
    expect(_internal.shouldRetry(400)).toBe(false);
    expect(_internal.shouldRetry(401)).toBe(false);
    expect(_internal.shouldRetry(403)).toBe(false);
    expect(_internal.shouldRetry(404)).toBe(false);
    expect(_internal.shouldRetry(200)).toBe(false);
  });

  it("parseRetryAfter handles seconds, HTTP-date, and bad input", () => {
    expect(_internal.parseRetryAfter("30")).toBe(30_000);
    expect(_internal.parseRetryAfter("0")).toBe(0);
    expect(_internal.parseRetryAfter(null)).toBeNull();
    expect(_internal.parseRetryAfter("not-a-date")).toBeNull();
    const future = new Date(Date.now() + 5_000).toUTCString();
    const ms = _internal.parseRetryAfter(future);
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThan(3_000);
    expect(ms!).toBeLessThan(6_000);
  });
});

describe("batchGetValues", () => {
  it("returns [] without hitting the network when ranges is empty", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await batchGetValues("sheet-1", []);
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("encodes every range as a separate query param and parses valueRanges in order", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        valueRanges: [
          { range: "raw_users!A2:E", values: [["u1", "Fran"]] },
          { range: "raw_accounts!A2:I", values: [] },
          { range: "raw_categories!A2:I", values: [["c1", "Food"]] },
        ],
      }),
    );

    const rows = await batchGetValues("sheet-1", [
      "raw_users!A2:E",
      "raw_accounts!A2:I",
      "raw_categories!A2:I",
    ]);

    expect(rows).toEqual([
      [["u1", "Fran"]],
      [],
      [["c1", "Food"]],
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0]!;
    // encodeURIComponent leaves `!` alone; encodes `:` as %3A.
    expect(url).toContain("/values:batchGet");
    expect(url).toContain("ranges=raw_users!A2%3AE");
    expect(url).toContain("ranges=raw_accounts!A2%3AI");
    expect(url).toContain("ranges=raw_categories!A2%3AI");
    expect(url).toContain("majorDimension=ROWS");
  });

  it("pads missing ranges with [] if the response is short", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ valueRanges: [{ range: "a", values: [["x"]] }] }),
    );
    const rows = await batchGetValues("sheet-1", ["a", "b", "c"]);
    expect(rows).toEqual([[["x"]], [], []]);
  });
});

describe("batchUpdateValues", () => {
  it("no-ops when updates is empty", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await batchUpdateValues("sheet-1", []);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends a single POST with valueInputOption=RAW and the data list", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ totalUpdatedCells: 4 }),
    );

    await batchUpdateValues("sheet-1", [
      { range: "raw_users!A2:B", values: [["u1", "Fran"], ["u2", "Sam"]] },
      { range: "raw_users!A1:B1", values: [["id", "name"]] },
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toContain("/values:batchUpdate");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init!.body as string);
    expect(body.valueInputOption).toBe("RAW");
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({
      range: "raw_users!A2:B",
      majorDimension: "ROWS",
      values: [
        ["u1", "Fran"],
        ["u2", "Sam"],
      ],
    });
  });
});

describe("batchClearValues", () => {
  it("no-ops when ranges is empty", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await batchClearValues("sheet-1", []);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends a single POST with the ranges list", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ clearedRanges: ["raw_users!A2:E"] }),
    );

    await batchClearValues("sheet-1", ["raw_users!A2:E", "raw_accounts!A2:I"]);

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toContain("/values:batchClear");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init!.body as string);
    expect(body.ranges).toEqual(["raw_users!A2:E", "raw_accounts!A2:I"]);
  });
});

describe("addSheets", () => {
  it("returns [] without hitting the network when titles is empty", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const created = await addSheets("sheet-1", []);
    expect(created).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("packs multiple addSheet requests into one batchUpdate call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        replies: [
          { addSheet: { properties: { sheetId: 10, title: "a", index: 1 } } },
          { addSheet: { properties: { sheetId: 11, title: "b", index: 2 } } },
        ],
      }),
    );

    const created = await addSheets("sheet-1", ["a", "b"]);

    expect(created).toEqual([
      { sheetId: 10, title: "a", index: 1 },
      { sheetId: 11, title: "b", index: 2 },
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toContain(":batchUpdate");
    const body = JSON.parse(init!.body as string);
    expect(body.requests).toHaveLength(2);
    expect(body.requests[0]).toEqual({
      addSheet: { properties: { title: "a" } },
    });
  });
});

describe("authorizedFetch retry-with-backoff (via getValues)", () => {
  it("retries on 429 then succeeds", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        errorResponse(429, { error: "rate limited" }, { "Retry-After": "1" }),
      )
      .mockResolvedValueOnce(jsonResponse({ values: [["ok"]] }));

    const rows = await getValues("sheet-1", "raw_users!A2:E");

    expect(rows).toEqual([["ok"]]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Sleep was invoked once between attempts, with the Retry-After-derived ms.
    expect(_internal._impl.sleep).toHaveBeenCalledTimes(1);
    expect(_internal._impl.sleep).toHaveBeenCalledWith(1_000);
  });

  it("retries on 503 and succeeds on the second try", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(errorResponse(503, { error: "unavailable" }))
      .mockResolvedValueOnce(jsonResponse({ values: [["ok"]] }));

    const rows = await getValues("sheet-1", "raw_users!A2:E");

    expect(rows).toEqual([["ok"]]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(_internal._impl.sleep).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 401 (auth) — fails fast", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(errorResponse(401, { error: "unauthorized" }));

    await expect(getValues("sheet-1", "raw_users!A2:E")).rejects.toBeInstanceOf(
      SheetsApiError,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(_internal._impl.sleep).not.toHaveBeenCalled();
  });

  it("gives up after MAX_RETRIES + 1 attempts and throws SheetsApiError", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        errorResponse(429, { error: "rate limited" }, { "Retry-After": "0" }),
      );

    await expect(
      getValues("sheet-1", "raw_users!A2:E"),
    ).rejects.toMatchObject({
      name: "SheetsApiError",
      status: 429,
    });
    // 1 initial + 3 retries = 4 attempts.
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(_internal._impl.sleep).toHaveBeenCalledTimes(3);
  });
});
