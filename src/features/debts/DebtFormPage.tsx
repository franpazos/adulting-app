/**
 * Debt form — handles both `/debts/new` and `/debts/:id/edit`.
 *
 * Five required fields (name, owner, currency, original_amount,
 * current_balance) and two practical optionals (minimum_payment,
 * payment_day) that power the per-currency monthly totals on `/debts`
 * and the "payment due soon" notification on Home. The remaining model
 * fields (interest_rate, strategy_priority, notes) are not in this
 * form yet — see progress-log for the scope decision.
 *
 * In edit mode the currency selector is disabled: changing currency on
 * an existing debt would silently re-interpret all stored amounts and
 * downstream FX-converted payments. If you really need to switch
 * currency, delete and re-create.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";

import {
  Button,
  Card,
  CardEyebrow,
  IconButton,
  Input,
  Pill,
  SegmentedControl,
  type SegmentedOption,
} from "@/components/ui";
import { debtsRepo } from "@/lib/db";
import type { OwnerType } from "@/lib/db/types";
import { useDbStore } from "@/store/dbStore";
import { cn } from "@/lib/utils/cn";
import {
  parseAmount,
  sanitizeAmountInput,
  formatAmountForInput,
} from "@/lib/utils/format";

type DebtCurrency = "EUR" | "USD";

interface DebtFormState {
  name: string;
  owner: OwnerType;
  currency: DebtCurrency;
  originalText: string;
  balanceText: string;
  minPaymentText: string;
  paymentDayText: string;
  notes: string;
}

function defaultState(): DebtFormState {
  return {
    name: "",
    owner: "HOUSEHOLD",
    currency: "EUR",
    originalText: "",
    balanceText: "",
    minPaymentText: "",
    paymentDayText: "",
    notes: "",
  };
}

export function DebtFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = id !== undefined && id !== "new";
  const dbReady = useDbStore((s) => s.status === "ready");
  const bumpVersion = useDbStore((s) => s.bumpVersion);

  const [state, setState] = useState<DebtFormState>(defaultState);
  const [loaded, setLoaded] = useState(!isEdit);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // In edit mode we need to preserve the fields the form doesn't touch
  // (interest_rate, strategy_priority, is_active) on save.
  const [carryover, setCarryover] = useState<{
    interest_rate: number | null;
    strategy_priority: number | null;
    is_active: boolean;
  }>({ interest_rate: null, strategy_priority: null, is_active: true });

  useEffect(() => {
    if (!dbReady || !isEdit || !id) return;
    const d = debtsRepo.getById(id);
    if (!d) {
      setLoaded(true);
      return;
    }
    setState({
      name: d.name,
      owner: d.owner_type,
      currency: (d.currency_code === "USD" ? "USD" : "EUR") as DebtCurrency,
      originalText: formatAmountForInput(d.original_amount),
      balanceText: formatAmountForInput(d.current_balance),
      minPaymentText:
        d.minimum_payment != null ? formatAmountForInput(d.minimum_payment) : "",
      paymentDayText: d.payment_day != null ? String(d.payment_day) : "",
      notes: d.notes ?? "",
    });
    setCarryover({
      interest_rate: d.interest_rate,
      strategy_priority: d.strategy_priority,
      is_active: d.is_active,
    });
    setLoaded(true);
  }, [dbReady, isEdit, id]);

  const originalAmount = parseAmount(state.originalText);
  const currentBalance = parseAmount(state.balanceText);
  const minimumPayment = state.minPaymentText
    ? parseAmount(state.minPaymentText)
    : null;
  const paymentDayParsed = parsePaymentDay(state.paymentDayText);

  const valid =
    state.name.trim().length > 0 &&
    originalAmount > 0 &&
    currentBalance >= 0 &&
    paymentDayParsed.ok;

  const ownerOptions: ReadonlyArray<SegmentedOption<OwnerType>> = [
    { value: "FRAN", label: t("addExpense.who.fran") },
    { value: "SAM", label: t("addExpense.who.sam") },
    { value: "HOUSEHOLD", label: t("addExpense.who.household") },
  ];
  const currencyOptions: ReadonlyArray<SegmentedOption<DebtCurrency>> = [
    { value: "EUR", label: "EUR" },
    { value: "USD", label: "USD" },
  ];

  function handleSave() {
    if (!dbReady || !valid || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        name: state.name.trim(),
        owner_type: state.owner,
        currency_code: state.currency,
        original_amount: originalAmount,
        current_balance: currentBalance,
        minimum_payment: minimumPayment,
        payment_day: paymentDayParsed.value,
        interest_rate: carryover.interest_rate,
        strategy_priority: carryover.strategy_priority,
        notes: state.notes.trim() || null,
        is_active: carryover.is_active,
      };
      if (isEdit && id) {
        debtsRepo.update(id, payload);
        bumpVersion();
        navigate(`/debts/${id}`);
      } else {
        const created = debtsRepo.create(payload);
        bumpVersion();
        navigate(`/debts/${created.id}`);
      }
    } catch (err) {
      console.error("[debt-form] save failed", err);
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  const symbol = state.currency === "USD" ? "$" : "€";

  return (
    <div className="mx-auto max-w-md px-4 pb-32 overflow-x-hidden">
      <div className="flex items-center justify-between pt-4 pb-2">
        <IconButton
          aria-label={t("common.cancel")}
          onClick={() => navigate(-1)}
        >
          <ChevronLeft className="size-5" />
        </IconButton>
        <h1 className="font-display text-base font-semibold">
          {isEdit ? t("debts.form.editTitle") : t("debts.form.newTitle")}
        </h1>
        <span className="size-10" aria-hidden />
      </div>

      <Section label={t("debts.form.name")}>
        <Input
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          placeholder={t("debts.form.namePlaceholder")}
        />
      </Section>

      <Section label={t("debts.form.owner")}>
        <SegmentedControl
          options={ownerOptions}
          value={state.owner}
          onChange={(v) => setState((s) => ({ ...s, owner: v }))}
          className="w-full justify-stretch [&>button]:flex-1"
          ariaLabel={t("debts.form.owner")}
        />
      </Section>

      <Section label={t("debts.form.currency")}>
        {isEdit ? (
          <>
            <Card variant="flat" className="px-4 py-3 flex items-center justify-between">
              <span className="font-medium">{state.currency}</span>
              <Pill tone="neutral" className="h-6 text-xs">
                {t("debts.form.locked")}
              </Pill>
            </Card>
            <p className="t-label text-xs mt-1">
              {t("debts.form.currencyLockedHint")}
            </p>
          </>
        ) : (
          <SegmentedControl
            options={currencyOptions}
            value={state.currency}
            onChange={(v) => setState((s) => ({ ...s, currency: v }))}
            className="w-full justify-stretch [&>button]:flex-1"
            ariaLabel={t("debts.form.currency")}
          />
        )}
      </Section>

      <Section label={t("debts.form.originalAmount")}>
        <AmountInput
          value={state.originalText}
          onChange={(v) =>
            setState((s) => ({ ...s, originalText: sanitizeAmountInput(v) }))
          }
          symbol={symbol}
          currency={state.currency}
        />
      </Section>

      <Section label={t("debts.form.currentBalance")}>
        <AmountInput
          value={state.balanceText}
          onChange={(v) =>
            setState((s) => ({ ...s, balanceText: sanitizeAmountInput(v) }))
          }
          symbol={symbol}
          currency={state.currency}
        />
      </Section>

      <Section label={t("debts.form.minimumPayment")}>
        <AmountInput
          value={state.minPaymentText}
          onChange={(v) =>
            setState((s) => ({ ...s, minPaymentText: sanitizeAmountInput(v) }))
          }
          symbol={symbol}
          currency={state.currency}
        />
      </Section>

      <Section label={t("debts.form.paymentDay")}>
        <Input
          inputMode="numeric"
          value={state.paymentDayText}
          onChange={(e) =>
            setState((s) => ({
              ...s,
              paymentDayText: e.target.value.replace(/[^\d]/g, "").slice(0, 2),
            }))
          }
          placeholder={t("debts.form.paymentDayPlaceholder")}
        />
        {!paymentDayParsed.ok && (
          <p className="t-label text-xs mt-1 text-expense-ink">
            {t("debts.form.paymentDayError")}
          </p>
        )}
      </Section>

      <Section label={t("debts.form.notes")}>
        <Input
          value={state.notes}
          onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
          placeholder={t("debts.form.notesPlaceholder")}
        />
      </Section>

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
            disabled={!valid || saving || !loaded}
            onClick={handleSave}
            className="bg-gradient-to-br from-violet-soft via-violet to-violet-ink text-white shadow-violet-glow"
          >
            {saving
              ? t("addExpense.saving")
              : isEdit
                ? t("debts.form.saveEdit")
                : t("debts.form.saveNew")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Parse a 1-31 day-of-month string. Empty is fine (returns null).
 * Anything else valid maps to a number. Anything invalid flips ok=false
 * so the save button disables and the inline error shows.
 */
function parsePaymentDay(
  text: string,
): { ok: true; value: number | null } | { ok: false; value: null } {
  if (!text) return { ok: true, value: null };
  const n = Number.parseInt(text, 10);
  if (!Number.isFinite(n) || n < 1 || n > 31) return { ok: false, value: null };
  return { ok: true, value: n };
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 space-y-2">
      <CardEyebrow>{label}</CardEyebrow>
      {children}
    </section>
  );
}

function AmountInput({
  value,
  onChange,
  symbol,
  currency,
}: {
  value: string;
  onChange: (next: string) => void;
  symbol: string;
  currency: string;
}) {
  return (
    <Card variant="flat" className="flex items-baseline gap-1.5 px-4 py-3">
      <span className="font-display text-2xl font-medium text-text-muted">
        {symbol}
      </span>
      <input
        inputMode="decimal"
        type="text"
        placeholder="0,00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "bg-transparent border-0 outline-none flex-1",
          "font-display text-2xl font-semibold tabular-nums",
          "text-text-primary placeholder:text-text-muted",
        )}
      />
      <Pill tone="neutral" className="h-7">
        {currency}
      </Pill>
    </Card>
  );
}

export default DebtFormPage;
