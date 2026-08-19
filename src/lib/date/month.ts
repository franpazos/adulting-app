import { addMonths, format, parse } from "date-fns";
import { enUS, es } from "date-fns/locale";

/**
 * Month keys are the canonical way to talk about months across the app.
 * Format: `YYYY-MM` (e.g. `2026-05`). All aggregations key off this.
 */
export type MonthKey = string;

const KEY_FORMAT = "yyyy-MM";

/**
 * The month Fran and Sam started using the app. There is no real data before
 * this, so the month navigation is floored here — you cannot page to (or land
 * on) any month earlier than this. Bump it only if the couple's history ever
 * legitimately extends further back. Because month keys are `YYYY-MM`, plain
 * string comparison against this constant is chronological.
 */
export const APP_START_MONTH: MonthKey = "2026-05";

export function toMonthKey(date: Date): MonthKey {
  return format(date, KEY_FORMAT);
}

/** Never let a month key precede APP_START_MONTH. */
export function clampMonthKey(key: MonthKey): MonthKey {
  return key < APP_START_MONTH ? APP_START_MONTH : key;
}

/** True at (or before) the floor — used to disable the "previous month" arrow. */
export function isAtStartMonth(key: MonthKey): boolean {
  return key <= APP_START_MONTH;
}

export function fromMonthKey(key: MonthKey): Date {
  return parse(key, KEY_FORMAT, new Date());
}

export function currentMonthKey(): MonthKey {
  return toMonthKey(new Date());
}

export function shiftMonthKey(key: MonthKey, delta: number): MonthKey {
  return toMonthKey(addMonths(fromMonthKey(key), delta));
}

const localeMap = { en: enUS, es } as const;
type Lang = keyof typeof localeMap;

/** Human-readable month label (e.g. "Mayo 2026", "May 2026") with title case. */
export function formatMonthLabel(key: MonthKey, lang: Lang = "es"): string {
  const date = fromMonthKey(key);
  const raw = format(date, "LLLL yyyy", { locale: localeMap[lang] });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
