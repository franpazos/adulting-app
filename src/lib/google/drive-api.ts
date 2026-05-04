/**
 * Drive helpers — used to validate that a Spreadsheet ID exists and is
 * accessible to the current user. Only metadata.get is used; we don't
 * list arbitrary Drive files (that needs a wider scope).
 */

/**
 * Extract a Spreadsheet ID from a Sheets URL or accept a raw ID.
 * Examples accepted:
 *   - https://docs.google.com/spreadsheets/d/1AbCdEf.../edit#gid=0
 *   - 1AbCdEfGhIjKlMn... (the ID itself)
 */
export function parseSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // URL form
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1] ?? null;
  // Bare ID — Google IDs are alnum + - + _ , typically ~44 chars
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}
