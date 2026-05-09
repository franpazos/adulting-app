/**
 * Pay debt — multi-currency aware. Inputs are in the debt's currency
 * (e.g. USD); the EUR impact on the source account is computed live via
 * `fx.ts` helpers. For same-currency debts, the FX card collapses.
 *
 * Save flow:
 *   1. Run expenseAllocator to derive allocations + settlements (the
 *      debt payment is, accounting-wise, an outflow owned by the debt's
 *      owner — same as a regular EXPENSE).
 *   2. Insert a DEBT_PAYMENT transaction with the FX columns populated.
 *   3. Insert a debt_payments row linked to the tx.
 *   4. Adjust the debt's current_balance by −amount_in_debt_currency.
 *   5. recomputeForTransaction (writes settlement_ledger entries).
 *   6. bumpVersion.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, RefreshCw, Zap } from "lucide-react";

import {
  Button,
  Card,
  CardEyebrow,
  IconButton,
  Pill,
  SegmentedControl,
  type SegmentedOption,
} from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import {
  expenseAllocator,
  fromAccountToDebt,
  fromDebtToAccount,
  isSameCurrency,
  recomputeForTransaction,
} from "@/lib/calculations";
import {
  debtPaymentsRepo,
  debtsRepo,
  transactionsRepo,
} from "@/lib/db";
import type { CashSource, Debt, OwnerType } from "@/lib/db/types";
import { useDbStore } from "@/store/dbStore";
import {
  SOURCE_TO_ACCOUNT,
  SOURCE_TO_USER,
} from "@/features/add-expense/sources";
import { cn } from "@/lib/utils/cn";

const ACCOUNT_CURRENCY = "EUR"; // All MVP source accounts are EUR

export function PayDebtPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const dbReady = useDbStore((s) => s.status === "ready");
  const bumpVersion = useDbStore((s) => s.bumpVersion);

  const [debt, setDebt] = useState<Debt | null>(null);
  const [debtAmount, setDebtAmount] = useState(0);
  const [debtAmountText, setDebtAmountText] = useState("");
  const [rate, setRate] = useState(1);
  const [source, setSource] = useState<CashSource>("FRAN_PERSONAL");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!dbReady || !id) return;
    const d = debtsRepo.getById(id);
    if (!d) return;
    setDebt(d);
    // Default rate: same-currency = 1; FX = 1.08 placeholder until user edits.
    if (isSameCurrency(d.currency_code, ACCOUNT_CURRENCY)) setRate(1);
    else setRate(1.08);
    // Default source preference: debt owner's personal account, fall back to JOINT.
    if (d.owner_type === "FRAN") setSource("FRAN_PERSONAL");
    else if (d.owner_type === "SAM") setSource("SAM_PERSONAL");
    else setSource("JOINT");
  }, [dbReady, id]);

  const isFx = debt
    ? !isSameCurrency(debt.currency_code, ACCOUNT_CURRENCY)
    : false;

  const accountAmount = useMemo(() => {
    if (!debt) return 0;
    if (!isFx) return debtAmount;
    return rate > 0 ? fromDebtToAccount(debtAmount, rate) : 0;
  }, [debt, debtAmount, rate, isFx]);

  const newBalance = debt
    ? Math.max(0, round2(debt.current_balance - debtAmount))
    : 0;

  const sourceOptions: ReadonlyArray<SegmentedOption<CashSource>> = [
    { value: "FRAN_PERSONAL", label: t("addExpense.who.fran") },
    { value: "SAM_PERSONAL", label: t("addExpense.who.sam") },
    { value: "JOINT", label: t("addExpense.who.joint") },
  ];

  function handleQuickPick(v: number) {
    setDebtAmount(v);
    setDebtAmountText(v.toString());
  }

  function handleAmountChange(text: string) {
    const sanitized = sanitizeAmount(text);
    setDebtAmountText(sanitized);
    setDebtAmount(parseAmount(sanitized));
  }

  function handleAccountAmountChange(text: string) {
    const sanitized = sanitizeAmount(text);
    const acct = parseAmount(sanitized);
    if (rate > 0 && isFx) {
      const debtSide = fromAccountToDebt(acct, rate);
      setDebtAmount(debtSide);
      setDebtAmountText(formatForInput(debtSide));
    } else {
      setDebtAmount(acct);
      setDebtAmountText(sanitized);
    }
  }

  function handleSave() {
    if (!debt || !id || !dbReady || debtAmount <= 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Determine owner from debt owner_type. The expenseAllocator handles the
      // settlement implications (joint→personal owes household, personal→shared
      // recompute, etc.) using the EUR (account-currency) amount.
      const owner: OwnerType = debt.owner_type;
      const allocation = expenseAllocator({
        amount: accountAmount,
        source,
        owner,
        splitFranPercent: 50,
      });

      const tx = transactionsRepo.create({
        type: "DEBT_PAYMENT",
        date,
        amount: accountAmount,
        currency_code: ACCOUNT_CURRENCY,
        source_account_id: SOURCE_TO_ACCOUNT[source],
        description: t("payDebt.txDescription", { name: debt.name }),
        category_id: null,
        created_by_user_id: SOURCE_TO_USER[source],
        merchant: null,
        origin: "MANUAL",
        sheet_sync_status: "PENDING",
        exchange_rate: isFx ? rate : null,
        amount_in_account_currency: accountAmount,
        amount_in_debt_currency: debtAmount,
        allocations: allocation.allocations,
      });

      debtPaymentsRepo.create({
        debt_id: debt.id,
        transaction_id: tx.id,
        payment_date: date,
        amount: debtAmount, // canonical: in debt currency
        principal_amount: null,
        interest_amount: null,
        exchange_rate: isFx ? rate : null,
        amount_in_account_currency: accountAmount,
        amount_in_debt_currency: debtAmount,
      });

      debtsRepo.adjustBalance(debt.id, -debtAmount);
      recomputeForTransaction(tx.id);
      bumpVersion();
      navigate(`/debts/${debt.id}`);
    } catch (err) {
      console.error("[pay-debt] save failed", err);
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  if (!debt) {
    return (
      <div className="mx-auto max-w-md px-4 pt-8">
        <p className="t-label">{t("debts.notFound")}</p>
      </div>
    );
  }

  const debtSymbol = currencySymbol(debt.currency_code);
  const presets = isFx ? [50, 100, 250, 500] : [25, 50, 100, 200];

  return (
    <div className="mx-auto max-w-md px-4 pb-32">
      <div className="flex items-center justify-between pt-4 pb-2">
        <IconButton
          aria-label={t("debts.backToList")}
          onClick={() => navigate(-1)}
        >
          <ChevronLeft className="size-5" />
        </IconButton>
        <h1 className="font-display text-base font-semibold">
          {t("payDebt.title")}
        </h1>
        <span className="size-10" aria-hidden />
      </div>

      {/* Debt summary */}
      <Card className="flex items-center gap-3">
        <Avatar who={debt.owner_type} size={36} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{debt.name}</p>
          <p className="text-[11px] text-text-secondary">
            {t("debts.balance")}{" "}
            {formatAmount(debt.current_balance, debt.currency_code)}
          </p>
        </div>
        <Pill
          tone={debt.currency_code === "USD" ? "info" : "neutral"}
          className="h-6 px-2 text-[11px]"
        >
          {debt.currency_code}
        </Pill>
      </Card>

      {/* Amount in debt currency */}
      <section className="mt-5 space-y-2">
        <CardEyebrow>{t("payDebt.amount")}</CardEyebrow>
        <Card className="text-center py-5 bg-gradient-to-b from-surface to-surface-2">
          <div className="flex items-baseline justify-center">
            <span className="font-display text-3xl font-medium text-text-muted self-start mt-2">
              {debtSymbol}
            </span>
            <input
              autoFocus
              inputMode="decimal"
              type="text"
              placeholder="0,00"
              value={debtAmountText}
              onChange={(e) => handleAmountChange(e.target.value)}
              className={cn(
                "bg-transparent border-0 outline-none text-center",
                "font-display text-5xl font-semibold tabular-nums tracking-tight",
                "text-text-primary placeholder:text-text-muted",
                "w-[min(70%,260px)]",
              )}
            />
          </div>
          <div className="flex justify-center gap-1.5 mt-3">
            {presets.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => handleQuickPick(v)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  debtAmount === v
                    ? "bg-violet text-white"
                    : "bg-surface-2 text-text-secondary border border-border",
                )}
              >
                {debtSymbol}
                {v}
              </button>
            ))}
          </div>
        </Card>
      </section>

      {/* FX exchange card — only when cross-currency */}
      {isFx && (
        <section className="mt-5 space-y-2">
          <CardEyebrow>{t("payDebt.exchange")}</CardEyebrow>
          <Card className="space-y-3">
            <div className="flex items-end gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-text-muted">
                  {t("payDebt.youPay")}
                </p>
                <p className="font-display text-xl font-semibold tabular-nums mt-0.5">
                  {debtSymbol}
                  {debtAmount.toFixed(2)}
                </p>
              </div>
              <div className="px-2 py-1 rounded-md bg-violet/10 text-violet text-[11px] font-semibold flex items-center gap-1">
                <RefreshCw className="size-3" />
                <span>1 € = {debtSymbol}{rate.toFixed(4)}</span>
              </div>
              <div className="flex-1 text-right min-w-0">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-text-muted">
                  {t("payDebt.eurImpact")}
                </p>
                <input
                  inputMode="decimal"
                  type="text"
                  value={
                    isFx ? formatForInput(accountAmount) : debtAmountText
                  }
                  onChange={(e) =>
                    handleAccountAmountChange(e.target.value)
                  }
                  className={cn(
                    "w-full text-right bg-transparent border-0 outline-none",
                    "font-display text-xl font-semibold tabular-nums",
                    "text-violet-ink dark:text-violet-soft",
                  )}
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-text-muted">
                {t("payDebt.rate")}
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={rate}
                step="0.0001"
                min="0"
                onChange={(e) => setRate(Number(e.target.value) || 0)}
                className={cn(
                  "mt-1 w-full h-10 px-3 rounded-xl",
                  "bg-surface-2 border border-border",
                  "font-display text-sm font-semibold tabular-nums",
                  "outline-none focus:border-violet",
                )}
              />
            </div>

            <div className="border-t border-border pt-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-text-secondary">
                  {t("payDebt.newBalance")}
                </span>
                <span className="font-display font-semibold tabular-nums">
                  {formatAmount(newBalance, debt.currency_code)}
                </span>
              </div>
            </div>
          </Card>
          <div
            className={cn(
              "flex items-start gap-2 px-3 py-2 rounded-xl",
              "bg-warning/10 text-warning-ink text-[11px] leading-relaxed",
            )}
          >
            <Zap className="size-3.5 mt-0.5 flex-shrink-0" />
            <span>{t("payDebt.fxCaveat")}</span>
          </div>
        </section>
      )}

      {/* Cash source */}
      <section className="mt-5 space-y-2">
        <CardEyebrow>{t("addExpense.paidFrom")}</CardEyebrow>
        <SegmentedControl
          options={sourceOptions}
          value={source}
          onChange={setSource}
          className="w-full justify-stretch [&>button]:flex-1"
          ariaLabel={t("addExpense.paidFrom")}
        />
      </section>

      {/* Date */}
      <section className="mt-5 space-y-2">
        <CardEyebrow>{t("addExpense.date")}</CardEyebrow>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 w-full rounded-2xl border border-border bg-surface px-4 text-base outline-none focus:border-violet"
        />
      </section>

      {saveError && (
        <p className="mt-3 text-sm text-expense-ink" role="alert">
          {saveError}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 pointer-events-none">
        <div className="mx-auto max-w-md px-4 pb-safe-bottom pb-4 pointer-events-auto">
          <Button
            block
            size="lg"
            disabled={debtAmount <= 0 || saving}
            onClick={handleSave}
            className="bg-gradient-to-br from-violet-soft via-violet to-violet-ink text-white shadow-violet-glow"
          >
            {saving
              ? t("addExpense.saving")
              : t("payDebt.saveLabel", {
                  amount: `${debtSymbol}${debtAmount.toFixed(2)}`,
                })}
          </Button>
        </div>
      </div>
    </div>
  );
}

function currencySymbol(code: string): string {
  if (code === "USD") return "$";
  if (code === "GBP") return "£";
  return "€";
}

function formatAmount(n: number, currency: string): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(n);
}

function parseAmount(text: string): number {
  if (!text) return 0;
  const normalized = text.replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function sanitizeAmount(text: string): string {
  let out = text.replace(/[^\d,.]/g, "");
  const firstSep = out.search(/[,.]/);
  if (firstSep !== -1) {
    out =
      out.slice(0, firstSep + 1) + out.slice(firstSep + 1).replace(/[,.]/g, "");
  }
  return out;
}

function formatForInput(n: number): string {
  if (n === 0) return "";
  return n.toFixed(2).replace(".", ",");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
