/**
 * Fetch the current EUR → <currency> exchange rate from a public, no-key
 * API. Tries frankfurter.app first (ECB-backed, no rate limits in
 * practice for sub-daily use), falling back to open.er-api.com if the
 * first call fails. The fallback is only invoked if the primary
 * actually fails — never duplicate requests on success.
 *
 * Returns the rate as "units of <currency> per 1 EUR" (e.g. 1.08 for
 * USD when 1 EUR ≈ 1.08 USD), matching the convention the PayDebt form
 * uses internally.
 *
 * No caching here — the caller decides when to refresh (today: only on
 * an explicit user tap on the refresh pill).
 */

export type FetchEurRateResult =
  | { ok: true; rate: number }
  | { ok: false; reason: "network" | "parse" | "unsupported" };

const FRANKFURTER_BASE = "https://api.frankfurter.app/latest";
const OPEN_ER_API_BASE = "https://open.er-api.com/v6/latest/EUR";

export async function fetchEurRate(
  toCurrency: string,
): Promise<FetchEurRateResult> {
  const code = toCurrency.toUpperCase();
  if (code === "EUR") return { ok: true, rate: 1 };

  try {
    const r = await fetchFromFrankfurter(code);
    if (r.ok) return r;
    // Frankfurter said the currency is unknown to ECB (e.g. ARS); no
    // point retrying the fallback for the same lookup if frankfurter
    // returned a *parsed* "no such currency" — but if it was a network
    // hiccup, try the secondary.
    if (r.reason !== "unsupported") {
      const r2 = await fetchFromOpenErApi(code);
      if (r2.ok) return r2;
      return r2;
    }
    // Try the secondary even on "unsupported" — open.er-api covers a
    // wider currency list (180+) than the ECB set. Cheap shot.
    const r2 = await fetchFromOpenErApi(code);
    return r2.ok ? r2 : r;
  } catch (err) {
    console.warn("[fx] frankfurter threw, trying fallback", err);
    return fetchFromOpenErApi(code);
  }
}

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

async function fetchFromFrankfurter(
  code: string,
): Promise<FetchEurRateResult> {
  const url = `${FRANKFURTER_BASE}?from=EUR&to=${code}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return { ok: false, reason: "network" };
  }
  if (!res.ok) {
    // 404 from frankfurter = unsupported currency code.
    if (res.status === 404) return { ok: false, reason: "unsupported" };
    return { ok: false, reason: "network" };
  }
  let body: FrankfurterResponse;
  try {
    body = (await res.json()) as FrankfurterResponse;
  } catch {
    return { ok: false, reason: "parse" };
  }
  const rate = body.rates?.[code];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return { ok: false, reason: "parse" };
  }
  return { ok: true, rate };
}

interface OpenErApiResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
}

async function fetchFromOpenErApi(
  code: string,
): Promise<FetchEurRateResult> {
  let res: Response;
  try {
    res = await fetch(OPEN_ER_API_BASE);
  } catch {
    return { ok: false, reason: "network" };
  }
  if (!res.ok) return { ok: false, reason: "network" };
  let body: OpenErApiResponse;
  try {
    body = (await res.json()) as OpenErApiResponse;
  } catch {
    return { ok: false, reason: "parse" };
  }
  if (body.result !== "success") return { ok: false, reason: "parse" };
  const rate = body.rates?.[code];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return { ok: false, reason: "unsupported" };
  }
  return { ok: true, rate };
}
