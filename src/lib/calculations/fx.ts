/**
 * FX helpers for multi-currency debt payments (ADR-004).
 *
 * Convention: `rate` is **debt units per 1 account unit**. Example: a USD
 * debt repaid from an EUR account at "1 EUR = 1.10 USD" → rate = 1.10.
 *
 *   account → debt: amountInAccount * rate
 *   debt → account: amountInDebt / rate
 *
 * This keeps the math direction-explicit so the UI can offer "I want to pay
 * $X" → live EUR impact, or "I have €Y available" → live USD impact.
 */

import { roundCurrency } from "./allocator";

export class InvalidExchangeRateError extends Error {
  constructor(rate: number) {
    super(`Exchange rate must be > 0, got ${rate}`);
    this.name = "InvalidExchangeRateError";
  }
}

export function fromAccountToDebt(
  amountInAccount: number,
  rate: number,
): number {
  if (!(rate > 0)) throw new InvalidExchangeRateError(rate);
  return roundCurrency(amountInAccount * rate);
}

export function fromDebtToAccount(
  amountInDebt: number,
  rate: number,
): number {
  if (!(rate > 0)) throw new InvalidExchangeRateError(rate);
  return roundCurrency(amountInDebt / rate);
}

export interface FxQuote {
  amountInAccountCurrency: number;
  amountInDebtCurrency: number;
  exchangeRate: number;
}

/** Build an FxQuote from the debt-side amount (typical for "pay $100"). */
export function quoteFromDebtAmount(
  amountInDebt: number,
  rate: number,
): FxQuote {
  return {
    amountInDebtCurrency: roundCurrency(amountInDebt),
    amountInAccountCurrency: fromDebtToAccount(amountInDebt, rate),
    exchangeRate: rate,
  };
}

/** Build an FxQuote from the account-side amount. */
export function quoteFromAccountAmount(
  amountInAccount: number,
  rate: number,
): FxQuote {
  return {
    amountInAccountCurrency: roundCurrency(amountInAccount),
    amountInDebtCurrency: fromAccountToDebt(amountInAccount, rate),
    exchangeRate: rate,
  };
}

/** True when both currencies are the same — FX is a no-op. */
export function isSameCurrency(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase();
}
