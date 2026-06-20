import { describe, it, expect } from "vitest";
import {
  formatEUR,
  formatMoney,
  formatRate,
  parseAmount,
  sanitizeAmountInput,
  formatAmountForInput,
} from "../format";

describe("formatEUR", () => {
  it("formats whole euros with thousand separators", () => {
    expect(formatEUR(0)).toBe("0,00 €");
    expect(formatEUR(1)).toBe("1,00 €");
    expect(formatEUR(1234)).toBe("1.234,00 €");
  });

  it("inserts thousand separators for larger values", () => {
    // useGrouping: "always" forces grouping from 4 digits up — the
    // es-ES CLDR default would skip 4-digit grouping.
    expect(formatEUR(12345)).toBe("12.345,00 €");
    expect(formatEUR(1234567.89)).toBe("1.234.567,89 €");
  });

  it("handles negatives", () => {
    expect(formatEUR(-1234.5)).toBe("-1.234,50 €");
  });
});

describe("formatMoney", () => {
  it("respects the currency code", () => {
    // Avoid asserting exact symbol — varies between ICU versions —
    // just check digits and grouping.
    expect(formatMoney(1234567.89, "USD")).toMatch(/1\.234\.567,89/);
    expect(formatMoney(1234567.89, "GBP")).toMatch(/1\.234\.567,89/);
  });

  it("honours minimumFractionDigits override", () => {
    expect(formatMoney(1000, "EUR", { minimumFractionDigits: 0 })).toMatch(
      /1000|1\.000/,
    );
  });

  it("supports signDisplay", () => {
    expect(formatMoney(50, "EUR", { signDisplay: "always" })).toMatch(/^\+/);
  });
});

describe("formatRate", () => {
  it("uses 4 decimals by default", () => {
    expect(formatRate(1.2345)).toBe("1,2345");
    expect(formatRate(1.2)).toBe("1,2000");
  });

  it("accepts a custom precision", () => {
    expect(formatRate(1.234567, 6)).toBe("1,234567");
  });
});

describe("parseAmount", () => {
  it("returns 0 for blanks and garbage", () => {
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("abc")).toBe(0);
    expect(parseAmount("---")).toBe(0);
  });

  it("parses plain integers and decimals", () => {
    expect(parseAmount("123")).toBe(123);
    expect(parseAmount("12,5")).toBe(12.5);
    expect(parseAmount("12.5")).toBe(12.5);
  });

  it("parses es-ES formatted amounts with thousand dots", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("1.234.567,89")).toBe(1234567.89);
  });

  it("also parses en-US shaped input (last separator wins)", () => {
    expect(parseAmount("1,234.56")).toBe(1234.56);
  });

  it("strips currency symbols and whitespace", () => {
    expect(parseAmount("€ 1.234,56")).toBe(1234.56);
    expect(parseAmount(" 99,99 €")).toBe(99.99);
  });
});

describe("sanitizeAmountInput", () => {
  it("returns empty for empty / garbage", () => {
    expect(sanitizeAmountInput("")).toBe("");
    expect(sanitizeAmountInput("abc")).toBe("");
  });

  it("formats integers with thousand separators as the user types", () => {
    expect(sanitizeAmountInput("1")).toBe("1");
    expect(sanitizeAmountInput("12")).toBe("12");
    expect(sanitizeAmountInput("123")).toBe("123");
    expect(sanitizeAmountInput("1234")).toBe("1.234");
    expect(sanitizeAmountInput("12345")).toBe("12.345");
    expect(sanitizeAmountInput("1234567")).toBe("1.234.567");
  });

  it("preserves a single decimal comma", () => {
    expect(sanitizeAmountInput("1234,5")).toBe("1.234,5");
    expect(sanitizeAmountInput("1234,56")).toBe("1.234,56");
    expect(sanitizeAmountInput("1234567,89")).toBe("1.234.567,89");
  });

  it("treats a lone dot as the decimal separator", () => {
    expect(sanitizeAmountInput("12.5")).toBe("12,5");
    expect(sanitizeAmountInput("1234.5")).toBe("1.234,5");
  });

  it("collapses extra separators (the *last* one wins as decimal)", () => {
    expect(sanitizeAmountInput("1.2.3,45")).toBe("123,45");
    expect(sanitizeAmountInput("1,234,56")).toBe("1.234,56");
  });

  it("strips leading zeros but keeps a lone 0", () => {
    expect(sanitizeAmountInput("0")).toBe("0");
    expect(sanitizeAmountInput("01")).toBe("1");
    expect(sanitizeAmountInput("007")).toBe("7");
    expect(sanitizeAmountInput("0,5")).toBe("0,5");
  });

  it("re-seeds a leading zero when the user starts with a decimal", () => {
    expect(sanitizeAmountInput(",5")).toBe("0,5");
    expect(sanitizeAmountInput(".5")).toBe("0,5");
  });
});

describe("formatAmountForInput", () => {
  it("returns empty for zero so the placeholder shows", () => {
    expect(formatAmountForInput(0)).toBe("");
  });

  it("formats stored numbers with two decimals and thousand dots", () => {
    expect(formatAmountForInput(5)).toBe("5,00");
    expect(formatAmountForInput(1234.5)).toBe("1.234,50");
    expect(formatAmountForInput(1234567.89)).toBe("1.234.567,89");
  });

  it("round-trips through parseAmount", () => {
    const cases = [5, 50, 500, 5000, 50_000, 500_000, 1_234_567.89];
    for (const n of cases) {
      expect(parseAmount(formatAmountForInput(n))).toBeCloseTo(n, 2);
    }
  });
});
