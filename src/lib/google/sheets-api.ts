/**
 * Thin wrapper around Google Sheets API v4. Surface we use:
 *   - getSpreadsheet (metadata, sheet titles, sheet ids)
 *   - addSheet, addSheets (create one or many tabs in a single batchUpdate)
 *   - getValues / batchGetValues (read one or many ranges)
 *   - updateValues / batchUpdateValues (overwrite one or many ranges)
 *   - clearValues / batchClearValues (clear one or many ranges)
 *   - duplicateSheet (template-clone for month-sync)
 *
 * All requests authorize via `getValidToken()` which silently re-prompts
 * when the access token has expired.
 *
 * `authorizedFetch` adds exponential-backoff retries for 429 and 5xx
 * responses (respecting the server's `Retry-After` header when present).
 * Auth-style failures (401, 403) and client errors (other 4xx) are NOT
 * retried — they need separate handling and retrying would just burn the
 * quota faster.
 */

import { getValidToken } from "./auth";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 800;
const RETRY_MAX_CAP_MS = 8000;

export class SheetsApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "SheetsApiError";
    this.status = status;
    this.body = body;
  }
}

function shouldRetry(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) return asSeconds * 1000;
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
}

function backoffDelay(attempt: number, retryAfterMs: number | null): number {
  if (retryAfterMs != null) {
    return Math.min(retryAfterMs, RETRY_MAX_CAP_MS);
  }
  // Exponential with full jitter: random in [base*2^attempt / 2, base*2^attempt].
  const exp = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_CAP_MS);
  return exp * (0.5 + Math.random() * 0.5);
}

// Exposed via _internal so tests can replace it with a no-op and avoid
// real-time waits during retry-loop assertions.
const _impl = {
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
};

async function authorizedFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getValidToken();
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, { ...init, headers });
    lastRes = res;
    if (res.ok || !shouldRetry(res.status)) return res;
    if (attempt === MAX_RETRIES) return res;
    const retryAfterMs = parseRetryAfter(res.headers.get("Retry-After"));
    await _impl.sleep(backoffDelay(attempt, retryAfterMs));
  }
  // Unreachable, but TS doesn't know — fall through to last response.
  return lastRes!;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      try {
        body = await res.text();
      } catch {
        body = null;
      }
    }
    throw new SheetsApiError(
      `Sheets API ${res.status} ${res.statusText}`,
      res.status,
      body,
    );
  }
  return (await res.json()) as T;
}

export interface SheetMetadata {
  sheetId: number;
  title: string;
  index: number;
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  sheets: SheetMetadata[];
}

export async function getSpreadsheet(
  spreadsheetId: string,
): Promise<SpreadsheetMetadata> {
  const url = `${BASE}/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,properties.title,sheets.properties(sheetId,title,index)`;
  const r = await authorizedFetch(url);
  const data = await asJson<{
    spreadsheetId: string;
    properties: { title: string };
    sheets: Array<{
      properties: { sheetId: number; title: string; index: number };
    }>;
  }>(r);
  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties.title,
    sheets: data.sheets.map((s) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
      index: s.properties.index,
    })),
  };
}

export async function addSheet(
  spreadsheetId: string,
  title: string,
): Promise<SheetMetadata> {
  const [created] = await addSheets(spreadsheetId, [title]);
  return created!;
}

/**
 * Create multiple tabs in a single `:batchUpdate` call. Returns metadata
 * for each created tab in the same order as `titles`. If `titles` is
 * empty this resolves to `[]` without hitting the network.
 */
export async function addSheets(
  spreadsheetId: string,
  titles: string[],
): Promise<SheetMetadata[]> {
  if (titles.length === 0) return [];
  const url = `${BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
  const r = await authorizedFetch(url, {
    method: "POST",
    body: JSON.stringify({
      requests: titles.map((title) => ({ addSheet: { properties: { title } } })),
    }),
  });
  const data = await asJson<{
    replies: Array<{
      addSheet: {
        properties: { sheetId: number; title: string; index: number };
      };
    }>;
  }>(r);
  return data.replies.map((rep) => ({
    sheetId: rep.addSheet.properties.sheetId,
    title: rep.addSheet.properties.title,
    index: rep.addSheet.properties.index,
  }));
}

/**
 * Duplicate an existing tab. Used by the month-sync service to clone a
 * formatted "template" month tab when starting a new month.
 */
export async function duplicateSheet(
  spreadsheetId: string,
  sourceSheetId: number,
  newTitle: string,
  insertIndex = 0,
): Promise<SheetMetadata> {
  const url = `${BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
  const r = await authorizedFetch(url, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          duplicateSheet: {
            sourceSheetId,
            insertSheetIndex: insertIndex,
            newSheetName: newTitle,
          },
        },
      ],
    }),
  });
  const data = await asJson<{
    replies: Array<{
      duplicateSheet: {
        properties: { sheetId: number; title: string; index: number };
      };
    }>;
  }>(r);
  const props = data.replies[0]!.duplicateSheet.properties;
  return { sheetId: props.sheetId, title: props.title, index: props.index };
}

export type CellValue = string | number | boolean | null;
export type SheetRow = CellValue[];

/** Read a rectangular range. */
export async function getValues(
  spreadsheetId: string,
  range: string,
): Promise<SheetRow[]> {
  const url = `${BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  const r = await authorizedFetch(url);
  const data = await asJson<{ values?: SheetRow[] }>(r);
  return data.values ?? [];
}

/**
 * Read N ranges in a single `values:batchGet` call. Returns the rows for
 * each range in the same order as `ranges`. Missing ranges resolve to
 * empty arrays. If `ranges` is empty, resolves to `[]` without hitting
 * the network.
 */
export async function batchGetValues(
  spreadsheetId: string,
  ranges: string[],
): Promise<SheetRow[][]> {
  if (ranges.length === 0) return [];
  const params = ranges
    .map((r) => `ranges=${encodeURIComponent(r)}`)
    .join("&");
  const url = `${BASE}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}&majorDimension=ROWS`;
  const r = await authorizedFetch(url);
  const data = await asJson<{
    valueRanges?: Array<{ range: string; values?: SheetRow[] }>;
  }>(r);
  const responses = data.valueRanges ?? [];
  // Sheets returns the responses in the same order as the request ranges;
  // pad with [] if for any reason we got fewer back.
  const result: SheetRow[][] = [];
  for (let i = 0; i < ranges.length; i++) {
    result.push(responses[i]?.values ?? []);
  }
  return result;
}

/** Overwrite a rectangular range with the given rows. */
export async function updateValues(
  spreadsheetId: string,
  range: string,
  rows: SheetRow[],
): Promise<void> {
  const url = `${BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const r = await authorizedFetch(url, {
    method: "PUT",
    body: JSON.stringify({ range, majorDimension: "ROWS", values: rows }),
  });
  await asJson<unknown>(r);
}

export interface ValueRangeUpdate {
  range: string;
  values: SheetRow[];
}

/**
 * Overwrite N ranges in a single `values:batchUpdate` call. No-op if
 * `updates` is empty.
 */
export async function batchUpdateValues(
  spreadsheetId: string,
  updates: ValueRangeUpdate[],
): Promise<void> {
  if (updates.length === 0) return;
  const url = `${BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;
  const r = await authorizedFetch(url, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: updates.map((u) => ({
        range: u.range,
        majorDimension: "ROWS",
        values: u.values,
      })),
    }),
  });
  await asJson<unknown>(r);
}

/** Clear a range — used before pushing a fresh full-table snapshot. */
export async function clearValues(
  spreadsheetId: string,
  range: string,
): Promise<void> {
  const url = `${BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:clear`;
  const r = await authorizedFetch(url, { method: "POST" });
  await asJson<unknown>(r);
}

/**
 * Clear N ranges in a single `values:batchClear` call. No-op if `ranges`
 * is empty.
 */
export async function batchClearValues(
  spreadsheetId: string,
  ranges: string[],
): Promise<void> {
  if (ranges.length === 0) return;
  const url = `${BASE}/${encodeURIComponent(spreadsheetId)}/values:batchClear`;
  const r = await authorizedFetch(url, {
    method: "POST",
    body: JSON.stringify({ ranges }),
  });
  await asJson<unknown>(r);
}

// Internals re-exported for testing only.
export const _internal = {
  shouldRetry,
  parseRetryAfter,
  backoffDelay,
  _impl,
};
