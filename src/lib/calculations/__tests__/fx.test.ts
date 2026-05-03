import { describe, expect, it } from "vitest";
import {
  fromAccountToDebt,
  fromDebtToAccount,
  isSameCurrency,
  quoteFromAccountAmount,
  quoteFromDebtAmount,
  InvalidExchangeRateError,
} from "@/lib/calculations/fx";

describe("FX helpers", () => {
  // Convention: rate is debt-units per 1 account-unit.
  // E.g. EUR account, USD debt, "1 EUR = 1.10 USD" → rate = 1.10.

  describe("fromAccountToDebt", () => {
    it("multiplies account amount by rate", () => {
      expect(fromAccountToDebt(100, 1.1)).toBe(110);
    });
    it("rounds to 2 decimals", () => {
      expect(fromAccountToDebt(33.33, 1.1)).toBe(36.66);
    });
    it("rejects non-positive rates", () => {
      expect(() => fromAccountToDebt(100, 0)).toThrow(InvalidExchangeRateError);
      expect(() => fromAccountToDebt(100, -1)).toThrow(InvalidExchangeRateError);
    });
  });

  describe("fromDebtToAccount", () => {
    it("divides debt amount by rate", () => {
      expect(fromDebtToAccount(110, 1.1)).toBe(100);
    });
    it("rounds to 2 decimals", () => {
      expect(fromDebtToAccount(100, 1.1)).toBe(90.91);
    });
    it("rejects non-positive rates", () => {
      expect(() => fromDebtToAccount(100, 0)).toThrow(InvalidExchangeRateError);
    });
  });

  describe("round-trip", () => {
    it("account → debt → account is approximately stable", () => {
      const rate = 1.0843;
      const start = 200;
      const debt = fromAccountToDebt(start, rate);
      const back = fromDebtToAccount(debt, rate);
      expect(back).toBeCloseTo(start, 1);
    });
  });

  describe("quoteFromDebtAmount", () => {
    it("produces a coherent quote", () => {
      const q = quoteFromDebtAmount(100, 1.1);
      expect(q.amountInDebtCurrency).toBe(100);
      expect(q.amountInAccountCurrency).toBe(90.91);
      expect(q.exchangeRate).toBe(1.1);
    });
  });

  describe("quoteFromAccountAmount", () => {
    it("produces a coherent quote", () => {
      const q = quoteFromAccountAmount(100, 1.1);
      expect(q.amountInAccountCurrency).toBe(100);
      expect(q.amountInDebtCurrency).toBe(110);
      expect(q.exchangeRate).toBe(1.1);
    });
  });

  describe("isSameCurrency", () => {
    it("is case-insensitive", () => {
      expect(isSameCurrency("EUR", "eur")).toBe(true);
      expect(isSameCurrency("USD", "EUR")).toBe(false);
    });
  });
});
