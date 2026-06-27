/**
 * Add Expense — Variation B (Flow diagram).
 *
 * The signature flow of the app. Lives at `/add` and is reachable from the
 * elevated central + button in the bottom nav. Saves to the local SQLite
 * via `transactionsRepo.create` + `recomputeForTransaction`, then bumps
 * `dbStore.dbVersion` so Home re-fetches.
 *
 * Visual reference: docs/design-handoff/scripts/add-expense.jsx (`AddExpenseB`).
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import { IconButton } from "@/components/ui";
import {
  TransactionForm,
  defaultFormValues,
  formatAmountForInput,
  parseAmount,
  type TransactionFormValues,
} from "./TransactionForm";
import { SaveFab } from "./SaveFab";

import {
  expenseAllocator,
  recomputeForTransaction,
} from "@/lib/calculations";
import { recurringRepo, transactionsRepo } from "@/lib/db";
import { useDbStore } from "@/store/dbStore";
import { useUiStore } from "@/store/uiStore";
import { useDefaultsStore } from "@/store/defaultsStore";
import {
  SOURCE_TO_ACCOUNT,
  SOURCE_TO_USER,
  accountIdToCashSource,
} from "./sources";
import {
  buildPatternKey,
  lookupLastUsed,
  recordLastUsed,
} from "./lastUsed";

export function AddTransactionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dbReady = useDbStore((s) => s.status === "ready");
  const bumpVersion = useDbStore((s) => s.bumpVersion);
  const setMonthKey = useUiStore((s) => s.setMonthKey);

  const fromRecurringId = searchParams.get("fromRecurring");

  const defaults = useDefaultsStore.getState();
  const [values, setValues] = useState<TransactionFormValues>(() => {
    const base = {
      ...defaultFormValues(),
      source: defaults.source,
      owner: defaults.owner,
      splitFranPercent: defaults.splitFranPercent,
    };
    // Smart-default the category from the last save matching this pattern.
    const memo = lookupLastUsed(
      buildPatternKey(base.source, base.owner, base.splitFranPercent),
    );
    return memo
      ? { ...base, categoryId: memo.categoryId ?? base.categoryId }
      : base;
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Track whether the user has manually picked a category. While untouched,
  // the smart suggestion follows source/owner/split changes; once they
  // explicitly pick one, we stop overriding their choice.
  const userTouchedCategoryRef = useRef(false);
  const handleChange = (next: TransactionFormValues) => {
    if (next.categoryId !== values.categoryId) {
      userTouchedCategoryRef.current = true;
    }
    // Switching type changes the available categories — clear the
    // selection so an EXPENSE category doesn't survive into INCOME
    // (and vice versa).
    if (next.type !== values.type) {
      next.categoryId = null;
      userTouchedCategoryRef.current = false;
    }
    setValues(next);
  };

  // Prefill from a recurring item when ?fromRecurring=<id> is present.
  // Date stays "today" — the user types the actual paid date if needed.
  // Flagging the category as touched stops the pattern-suggestion effect
  // from clobbering the recurring's category once source/owner mount.
  useEffect(() => {
    if (!dbReady || !fromRecurringId) return;
    const r = recurringRepo.getById(fromRecurringId);
    if (!r || r.type === "DEBT_PAYMENT") return;
    userTouchedCategoryRef.current = true;
    setValues((prev) => ({
      ...prev,
      type: r.type === "INCOME" ? "INCOME" : "EXPENSE",
      amountText: formatAmountForInput(r.amount),
      source: r.source_account_id
        ? accountIdToCashSource(r.source_account_id)
        : prev.source,
      owner: r.owner_type,
      splitFranPercent:
        r.owner_type === "HOUSEHOLD"
          ? r.default_shared_split_percent ?? prev.splitFranPercent
          : prev.splitFranPercent,
      categoryId: r.category_id ?? prev.categoryId,
    }));
  }, [dbReady, fromRecurringId]);

  // When the pattern (source/owner/split) changes and the user hasn't
  // touched the category, refresh the suggestion from memory. Only runs
  // for EXPENSE — INCOME has no smart-default memory yet.
  useEffect(() => {
    if (userTouchedCategoryRef.current) return;
    if (values.type !== "EXPENSE") return;
    const memo = lookupLastUsed(
      buildPatternKey(values.source, values.owner, values.splitFranPercent),
    );
    const suggested = memo?.categoryId ?? null;
    if (suggested !== values.categoryId) {
      setValues((prev) => ({ ...prev, categoryId: suggested }));
    }
    // Only react to pattern changes — categoryId in deps would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.type, values.source, values.owner, values.splitFranPercent]);

  const amount = parseAmount(values.amountText);

  function handleSave() {
    if (!dbReady || amount <= 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const isIncome = values.type === "INCOME";
      // INCOME: single allocation to the chosen owner at 100%, no
      // settlement implications. EXPENSE: use the canonical allocator
      // that handles split + cash-source settlements.
      const allocations = isIncome
        ? [
            {
              owner_type: values.owner,
              share_percent: 100,
              share_amount: amount,
            },
          ]
        : expenseAllocator({
            amount,
            source: values.source,
            owner: values.owner,
            splitFranPercent: values.splitFranPercent,
          }).allocations;
      const tx = transactionsRepo.create({
        type: isIncome ? "INCOME" : "EXPENSE",
        date: values.date,
        amount,
        currency_code: "EUR",
        source_account_id: SOURCE_TO_ACCOUNT[values.source],
        description: values.description.trim() || null,
        category_id: values.categoryId,
        created_by_user_id: SOURCE_TO_USER[values.source],
        origin: "MANUAL",
        sheet_sync_status: "PENDING",
        recurring_id: fromRecurringId,
        allocations,
      });
      // Income has no settlement effect — skip the recompute. Saves a
      // pointless ledger pass on the common nómina case.
      if (!isIncome) recomputeForTransaction(tx.id);
      bumpVersion();
      setMonthKey(tx.month_key);
      // Smart-default memory is keyed by the expense pattern; recording
      // it for income would pollute the next expense suggestion.
      if (!isIncome) {
        recordLastUsed(
          buildPatternKey(values.source, values.owner, values.splitFranPercent),
          { categoryId: values.categoryId },
        );
      }
      navigate(fromRecurringId ? `/recurring/${fromRecurringId}` : "/");
    } catch (err) {
      console.error("[add-expense] save failed", err);
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-24 overflow-x-hidden">
      <div className="flex items-center justify-between pt-4 pb-2">
        <IconButton
          aria-label={t("common.cancel")}
          onClick={() => navigate(-1)}
        >
          <X className="size-5" />
        </IconButton>
        <h1 className="font-display text-base font-semibold">
          {values.type === "INCOME"
            ? t("addExpense.titleIncome")
            : t("addExpense.title")}
        </h1>
        <span className="size-10" aria-hidden />
      </div>

      <TransactionForm values={values} onChange={handleChange} />

      {saveError && (
        <p className="mt-3 text-sm text-expense-ink" role="alert">
          {saveError}
        </p>
      )}

      <SaveFab
        amount={amount}
        disabled={amount <= 0 || saving}
        loading={saving}
        onClick={handleSave}
        labelKey={
          values.type === "INCOME"
            ? "addExpense.saveLabelIncome"
            : "addExpense.saveLabel"
        }
      />
    </div>
  );
}
