/**
 * Money & number formatting — single source of truth.
 *
 * Display formatters use es-ES locale: "1.234.567,89 €" (dot for
 * thousands, comma for decimals). Use these everywhere money is shown
 * to the user.
 *
 * The input helpers (sanitizeAmountInput + parseAmount +
 * formatAmountForInput) keep money input fields showing the thousand
 * separators *while the user types*, while parseAmount turns the
 * displayed text back into a canonical number on save.
 */

/** "1.234,56 €" — EUR-fixed display formatter. */
export function formatEUR(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    useGrouping: true,
  }).format(n);
}

/** "1.234,56 $" / "1.234,56 €" — multi-currency display formatter. */
export function formatMoney(
  n: number,
  currency: string,
  opts: {
    minimumFractionDigits?: number;
    /** Pass "auto" / "always" / "never" / "exceptZero" to control sign. */
    signDisplay?: "auto" | "always" | "never" | "exceptZero";
  } = {},
): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: opts.minimumFractionDigits ?? 2,
    ...(opts.signDisplay ? { signDisplay: opts.signDisplay } : {}),
    useGrouping: true,
  }).format(n);
}

/** "1,2345" — for exchange rates and similar. Default 4 decimals. */
export function formatRate(n: number, fractionDigits = 4): string {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: true,
  }).format(n);
}

/**
 * Parse a user-typed amount (possibly with thousand separators and a
 * decimal comma or dot) into a number. Returns 0 for blanks/invalid.
 *
 * Handles both "1.234,56" (es-ES) and "1,234.56" (en-US) shapes by
 * treating the *last* separator as the decimal point.
 */
export function parseAmount(text: string): number {
  if (!text) return 0;
  const cleaned = text.replace(/[^\d,.]/g, "");
  if (!cleaned) return 0;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = cleaned;
  } else if (lastComma > lastDot) {
    // Comma is decimal separator → strip dots, swap comma for dot.
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // Dot is decimal separator → strip commas (thousand groupers).
    normalized = cleaned.replace(/,/g, "");
  }
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Re-shape a user-typed amount so the input always shows the es-ES
 * format with thousand-dot separators and a single decimal comma.
 *
 * Examples:
 *   "1234"        → "1.234"
 *   "12345"       → "12.345"
 *   "1234567,8"   → "1.234.567,8"
 *   "1234.5"      → "1.234,5"    (lone dot → decimal comma)
 *   "0,5"         → "0,5"
 *   "01234"       → "1.234"       (leading zeros stripped)
 *   ""            → ""
 *
 * Use this as the `onChange` sanitizer for money input fields.
 */
export function sanitizeAmountInput(raw: string): string {
  if (!raw) return "";
  // Strip everything that isn't a digit or one of our separators.
  const s = raw.replace(/[^\d,.]/g, "");
  if (!s) return "";

  // Decide which separator is the decimal point: the *last* one.
  // Everything else collapses (treat as thousand groupers and drop).
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let intPart: string;
  let decPart: string | null;
  if (lastComma === -1 && lastDot === -1) {
    intPart = s;
    decPart = null;
  } else {
    const decIdx = Math.max(lastComma, lastDot);
    intPart = s.slice(0, decIdx).replace(/[,.]/g, "");
    decPart = s.slice(decIdx + 1).replace(/[,.]/g, "");
  }

  // Strip leading zeros from the integer part (but only when followed
  // by another digit, so a lone "0" stays "0").
  intPart = intPart.replace(/^0+(?=\d)/, "");

  // Insert dots every three digits in the integer part.
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  if (decPart === null) return intFormatted;
  // If int part is empty (user typed ",5"), seed it with "0".
  return `${intFormatted || "0"},${decPart}`;
}

/**
 * Format a stored numeric amount as the initial value of a money
 * input — "1234.56" → "1.234,56". Empty for zero so the placeholder
 * shows.
 */
export function formatAmountForInput(n: number): string {
  if (!n) return "";
  return sanitizeAmountInput(n.toFixed(2).replace(".", ","));
}
