/**
 * Month-sync service — spec §14.6.
 *
 * The user's spreadsheet contains formatted monthly tabs (e.g. one per
 * month, with formulas pulling from the raw_* tabs). When the active
 * month changes, the new month's tab needs to exist before any write
 * lands; otherwise the formulas have nowhere to compute against.
 *
 * This module is a **scaffold**. The exact template format (tab name,
 * range layout, formula structure) lives in the user's existing sheet,
 * not in this codebase. So we expose a small interface that:
 *
 *   1. Names the month tab via a configurable convention
 *      (`monthTabTitle(monthKey)`).
 *   2. Checks whether that tab already exists.
 *   3. If not, either duplicates a designated template tab (preferred)
 *      or creates a blank tab as a fallback.
 *
 * It does **not** auto-run — `ensureMonthSheet` is invoked explicitly
 * from a UI affordance the user triggers (or, eventually, from auto-sync
 * once we have a stable convention). This keeps it from accidentally
 * creating bogus tabs in the user's spreadsheet during early use.
 *
 * Spec quote: "It is acceptable to scaffold the service with a clear
 * interface and TODOs if the exact existing spreadsheet template logic
 * is not fully known yet."
 */

import {
  addSheet,
  duplicateSheet,
  getSpreadsheet,
  type SheetMetadata,
} from "@/lib/google/sheets-api";

export interface MonthSyncOptions {
  /**
   * Name of an existing tab to duplicate as the template. If omitted (or
   * the named tab doesn't exist), `ensureMonthSheet` creates a blank tab
   * with `addSheet` instead. The template's formulas should reference
   * the raw_* tabs by name so duplicated copies "just work" without
   * post-creation rewrites.
   *
   * Convention recommendation: name the template tab `Mes - plantilla`
   * (Spanish) or `Month - template` (English) so it sorts visually away
   * from the real month tabs.
   */
  templateTitle?: string;

  /**
   * Tab name format. Defaults to `YYYY-MM` (e.g. `2026-05`). Override if
   * the user's existing convention differs (e.g. `Mayo 2026`, `2026-05
   * Hogar`). The function receives a `MonthKey` and returns the title.
   */
  formatTitle?: (monthKey: string) => string;

  /**
   * Where to insert a newly created month tab. 0 = leftmost. Default 1
   * (after the template tab if it's at index 0). Sheets renders tabs in
   * insertion order, so this controls the visual ordering.
   */
  insertIndex?: number;
}

export interface EnsureMonthResult {
  /** The tab that now exists (whether pre-existing or just created). */
  sheet: SheetMetadata;
  /** Whether we created the tab during this call. */
  created: boolean;
  /** If created, how — duplicated from template or blank addSheet. */
  source: "existing" | "duplicated" | "created-blank";
}

/** Default tab title format: `YYYY-MM`. */
export function defaultMonthTabTitle(monthKey: string): string {
  return monthKey;
}

/**
 * Ensure a tab for `monthKey` exists in the spreadsheet. Idempotent —
 * a second call for the same month is a no-op (returns `existing`).
 *
 * NOTE: This does not write any data into the new tab. The template's
 * formulas are expected to do the heavy lifting by referencing raw_*
 * tabs. If the template doesn't exist, the blank tab created here will
 * just sit empty — that's a deliberate user-driven step, not silent.
 */
export async function ensureMonthSheet(
  spreadsheetId: string,
  monthKey: string,
  opts: MonthSyncOptions = {},
): Promise<EnsureMonthResult> {
  const formatTitle = opts.formatTitle ?? defaultMonthTabTitle;
  const target = formatTitle(monthKey);

  const meta = await getSpreadsheet(spreadsheetId);
  const existing = meta.sheets.find((s) => s.title === target);
  if (existing) {
    return { sheet: existing, created: false, source: "existing" };
  }

  const template = opts.templateTitle
    ? meta.sheets.find((s) => s.title === opts.templateTitle)
    : undefined;

  if (template) {
    const sheet = await duplicateSheet(
      spreadsheetId,
      template.sheetId,
      target,
      opts.insertIndex ?? 1,
    );
    return { sheet, created: true, source: "duplicated" };
  }

  // Fallback: blank tab. Caller's formulas (if any) will need to be
  // populated separately — outside this scaffold's scope.
  const sheet = await addSheet(spreadsheetId, target);
  return { sheet, created: true, source: "created-blank" };
}

// TODO (future):
//   - Hook `ensureMonthSheet` into the auto-sync path so the active
//     month tab is guaranteed present before any push that would write
//     month-keyed data. Today push only writes to raw_* tabs (which are
//     month-agnostic), so this isn't strictly required yet.
//   - Add a UI in Settings → SyncCard for the user to nominate their
//     `templateTitle` and override `formatTitle` once we know their
//     sheet's existing convention.
//   - When deactivating an old month (e.g. archive read-only), provide
//     `archiveMonthSheet(spreadsheetId, monthKey)` that hides the tab
//     rather than deleting it.
