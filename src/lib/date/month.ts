import { addMonths, format, parse } from "date-fns";
import { enUS, es } from "date-fns/locale";

/**
 * Month keys are the canonical way to talk about months across the app.
 * Format: `YYYY-MM` (e.g. `2026-05`). All aggregations key off this.
 */
export type MonthKey = string;

const KEY_FORMAT = "yyyy-MM";

export function toMonthKey(date: Date): MonthKey {
  return format(date, KEY_FORMAT);
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
