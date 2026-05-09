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

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import { IconButton } from "@/components/ui";
import {
  TransactionForm,
  defaultFormValues,
  parseAmount,
  type TransactionFormValues,
} from "./TransactionForm";
import { SaveFab } from "./SaveFab";

import {
  expenseAllocator,
  recomputeForTransaction,
} from "@/lib/calculations";
import { transactionsRepo } from "@/lib/db";
import { useDbStore } from "@/store/dbStore";
import { useUiStore } from "@/store/uiStore";
import { useDefaultsStore } from "@/store/defaultsStore";
import { SOURCE_TO_ACCOUNT, SOURCE_TO_USER } from "./sources";

export function AddExpensePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dbReady = useDbStore((s) => s.status === "ready");
  const bumpVersion = useDbStore((s) => s.bumpVersion);
  const setMonthKey = useUiStore((s) => s.setMonthKey);

  const defaults = useDefaultsStore.getState();
  const [values, setValues] = useState<TransactionFormValues>(() => ({
    ...defaultFormValues(),
    source: defaults.source,
    owner: defaults.owner,
    splitFranPercent: defaults.splitFranPercent,
  }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const amount = parseAmount(values.amountText);

  function handleSave() {
    if (!dbReady || amount <= 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const allocation = expenseAllocator({
        amount,
        source: values.source,
        owner: values.owner,
        splitFranPercent: values.splitFranPercent,
      });
      const tx = transactionsRepo.create({
        type: "EXPENSE",
        date: values.date,
        amount,
        currency_code: "EUR",
        source_account_id: SOURCE_TO_ACCOUNT[values.source],
        description: values.description.trim() || null,
        category_id: values.categoryId,
        created_by_user_id: SOURCE_TO_USER[values.source],
        origin: "MANUAL",
        sheet_sync_status: "PENDING",
        allocations: allocation.allocations,
      });
      recomputeForTransaction(tx.id);
      bumpVersion();
      setMonthKey(tx.month_key);
      navigate("/");
    } catch (err) {
      console.error("[add-expense] save failed", err);
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-32">
      <div className="flex items-center justify-between pt-4 pb-2">
        <IconButton
          aria-label={t("common.cancel")}
          onClick={() => navigate(-1)}
        >
          <X className="size-5" />
        </IconButton>
        <h1 className="font-display text-base font-semibold">
          {t("addExpense.title")}
        </h1>
        <span className="size-10" aria-hidden />
      </div>

      <TransactionForm values={values} onChange={setValues} />

      {saveError && (
        <p className="mt-3 text-sm text-expense" role="alert">
          {saveError}
        </p>
      )}

      <SaveFab
        amount={amount}
        disabled={amount <= 0 || saving}
        loading={saving}
        onClick={handleSave}
      />
    </div>
  );
}
