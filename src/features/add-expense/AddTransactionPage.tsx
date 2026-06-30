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

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import { IconButton } from "@/components/ui";
import {
  TransactionForm,
  defaultFormValues,
  formatAmountForInput,
  parseAmount,
  transferValidationError,
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

export function AddTransactionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dbReady = useDbStore((s) => s.status === "ready");
  const bumpVersion = useDbStore((s) => s.bumpVersion);
  const setMonthKey = useUiStore((s) => s.setMonthKey);

  const fromRecurringId = searchParams.get("fromRecurring");

  const defaults = useDefaultsStore.getState();
  const [values, setValues] = useState<TransactionFormValues>(() => ({
    ...defaultFormValues(),
    source: defaults.source,
    owner: defaults.owner,
    splitFranPercent: defaults.splitFranPercent,
  }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleChange = (next: TransactionFormValues) => {
    // Switching type changes the available categories — clear the
    // selection so an EXPENSE category doesn't survive into INCOME
    // (and vice versa).
    if (next.type !== values.type) {
      next.categoryId = null;
    }
    setValues(next);
  };

  // Prefill from a recurring item when ?fromRecurring=<id> is present.
  // Date stays "today" — the user types the actual paid date if needed.
  useEffect(() => {
    if (!dbReady || !fromRecurringId) return;
    const r = recurringRepo.getById(fromRecurringId);
    if (!r || r.type === "DEBT_PAYMENT") return;
    const nextType: "EXPENSE" | "INCOME" | "TRANSFER" =
      r.type === "INCOME"
        ? "INCOME"
        : r.type === "TRANSFER"
          ? "TRANSFER"
          : "EXPENSE";
    setValues((prev) => ({
      ...prev,
      type: nextType,
      amountText: formatAmountForInput(r.amount),
      source: r.source_account_id
        ? accountIdToCashSource(r.source_account_id)
        : prev.source,
      destination: r.destination_account_id
        ? accountIdToCashSource(r.destination_account_id)
        : prev.destination,
      owner: r.owner_type,
      splitFranPercent:
        r.owner_type === "HOUSEHOLD"
          ? r.default_shared_split_percent ?? prev.splitFranPercent
          : prev.splitFranPercent,
      categoryId: nextType === "TRANSFER" ? null : r.category_id ?? prev.categoryId,
    }));
  }, [dbReady, fromRecurringId]);

  const amount = parseAmount(values.amountText);
  const transferError =
    values.type === "TRANSFER"
      ? transferValidationError(values.source, values.destination)
      : null;
  const saveDisabled = amount <= 0 || saving || transferError !== null;

  function handleSave() {
    if (!dbReady || saveDisabled) return;
    setSaving(true);
    setSaveError(null);
    try {
      const isIncome = values.type === "INCOME";
      const isTransfer = values.type === "TRANSFER";
      // TRANSFER: zero allocations, no recompute, no pattern memory.
      // INCOME: single 100% allocation. EXPENSE: canonical allocator.
      const allocations = isTransfer
        ? []
        : isIncome
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
        type: isTransfer ? "TRANSFER" : isIncome ? "INCOME" : "EXPENSE",
        date: values.date,
        amount,
        currency_code: "EUR",
        source_account_id: SOURCE_TO_ACCOUNT[values.source],
        description: values.description.trim() || null,
        category_id: isTransfer ? null : values.categoryId,
        created_by_user_id: SOURCE_TO_USER[values.source],
        origin: "MANUAL",
        sheet_sync_status: "PENDING",
        recurring_id: fromRecurringId,
        destination_account_id: isTransfer
          ? SOURCE_TO_ACCOUNT[values.destination]
          : null,
        allocations,
      });
      // Income and Transfer have no settlement effect — skip recompute.
      if (!isIncome && !isTransfer) recomputeForTransaction(tx.id);
      bumpVersion();
      setMonthKey(tx.month_key);
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
            : values.type === "TRANSFER"
              ? t("addExpense.titleTransfer")
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
        disabled={saveDisabled}
        loading={saving}
        onClick={handleSave}
        labelKey={
          values.type === "INCOME"
            ? "addExpense.saveLabelIncome"
            : values.type === "TRANSFER"
              ? "addExpense.saveLabelTransfer"
              : "addExpense.saveLabel"
        }
      />
    </div>
  );
}
