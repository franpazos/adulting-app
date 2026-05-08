/**
 * Thin wrapper around Google Sheets API v4. Only the surface we use:
 *   - getSpreadsheet (metadata, sheet titles, sheet ids)
 *   - addSheet (create a tab)
 *   - getValues (read a range)
 *   - updateValues (overwrite a range, single batch)
 *   - clearValues (clear a range)
 *
 * All requests authorize via `getValidToken()` which silently re-prompts
 * when the access token has expired.
 */

import { getValidToken } from "./auth";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

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
  return fetch(url, { ...init, headers });
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
  const url = `${BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
  const r = await authorizedFetch(url, {
    method: "POST",
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title } } }],
    }),
  });
  const data = await asJson<{
    replies: Array<{
      addSheet: {
        properties: { sheetId: number; title: string; index: number };
      };
    }>;
  }>(r);
  const props = data.replies[0]!.addSheet.properties;
  return { sheetId: props.sheetId, title: props.title, index: props.index };
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

/** Clear a range — used before pushing a fresh full-table snapshot. */
export async function clearValues(
  spreadsheetId: string,
  range: string,
): Promise<void> {
  const url = `${BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:clear`;
  const r = await authorizedFetch(url, { method: "POST" });
  await asJson<unknown>(r);
}
