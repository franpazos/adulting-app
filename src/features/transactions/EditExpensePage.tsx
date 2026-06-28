/**
 * Edit + soft-delete an existing expense. Reuses TransactionForm so the
 * UI and live preview match Add Expense exactly.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Trash2 } from "lucide-react";

import { Button, IconButton } from "@/components/ui";
import {
  TransactionForm,
  defaultFormValues,
  formatAmountForInput,
  parseAmount,
  transferValidationError,
  type TransactionFormValues,
} from "@/features/add-expense/TransactionForm";
import { SaveFab } from "@/features/add-expense/SaveFab";

import {
  expenseAllocator,
  inferOwnerFromAllocations,
  inferSplitFranPercent,
  recomputeForTransaction,
} from "@/lib/calculations";
import { transactionsRepo } from "@/lib/db";
import {
  SOURCE_TO_ACCOUNT,
  SOURCE_TO_USER,
  accountIdToCashSource,
} from "@/features/add-expense/sources";
import { useDbStore } from "@/store/dbStore";

export function EditExpensePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const dbReady = useDbStore((s) => s.status === "ready");
  const bumpVersion = useDbStore((s) => s.bumpVersion);

  const [values, setValues] = useState<TransactionFormValues>(
    defaultFormValues,
  );
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!dbReady || !id) return;
    const tx = transactionsRepo.getById(id);
    if (!tx || tx.is_deleted) {
      setNotFound(true);
      setLoaded(true);
      return;
    }
    const allocations = transactionsRepo.allocationsFor(tx.id);
    const txType: "EXPENSE" | "INCOME" | "TRANSFER" =
      tx.type === "INCOME"
        ? "INCOME"
        : tx.type === "TRANSFER"
          ? "TRANSFER"
          : "EXPENSE";
    setValues({
      type: txType,
      amountText: formatAmountForInput(tx.amount),
      source: accountIdToCashSource(tx.source_account_id),
      // For TRANSFER, the destination is what matters and allocations
      // are empty. For EXPENSE/INCOME, destination is unused — default
      // to JOINT to keep the form shape valid.
      destination: tx.destination_account_id
        ? accountIdToCashSource(tx.destination_account_id)
        : "JOINT",
      owner: inferOwnerFromAllocations(allocations),
      splitFranPercent: inferSplitFranPercent(allocations),
      date: tx.date,
      description: tx.description ?? "",
      categoryId: tx.category_id,
    });
    setLoaded(true);
  }, [dbReady, id]);

  const amount = useMemo(() => parseAmount(values.amountText), [values.amountText]);

  function handleSave() {
    if (!dbReady || !id || amount <= 0 || saving) return;
    if (values.type === "TRANSFER" && transferValidationError(values.source, values.destination))
      return;
    setSaving(true);
    setSaveError(null);
    try {
      const isIncome = values.type === "INCOME";
      const isTransfer = values.type === "TRANSFER";
      // INCOME: single 100% allocation. EXPENSE: allocator. TRANSFER:
      // no allocations (and no recompute) — pure money movement.
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
      transactionsRepo.update(id, {
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
        destination_account_id: isTransfer
          ? SOURCE_TO_ACCOUNT[values.destination]
          : null,
        allocations,
      });
      // Income and Transfer don't drive settlement; expense edits still do.
      if (!isIncome && !isTransfer) recomputeForTransaction(id);
      bumpVersion();
      navigate(-1);
    } catch (err) {
      console.error("[edit-expense] save failed", err);
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!dbReady || !id || saving) return;
    if (!window.confirm(t("transactions.confirmDelete"))) return;
    try {
      transactionsRepo.softDelete(id);
      recomputeForTransaction(id);
      bumpVersion();
      navigate(-1);
    } catch (err) {
      console.error("[edit-expense] delete failed", err);
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-md px-4 pt-8">
        <p className="t-label">{t("transactions.notFound")}</p>
        <Button
          variant="ghost"
          className="mt-3"
          onClick={() => navigate("/transactions")}
        >
          {t("transactions.backToList")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-32 overflow-x-hidden">
      <div className="flex items-center justify-between pt-4 pb-2">
        <IconButton aria-label={t("common.cancel")} onClick={() => navigate(-1)}>
          <ChevronLeft className="size-5" />
        </IconButton>
        <h1 className="font-display text-base font-semibold">
          {t("transactions.editTitle")}
        </h1>
        <IconButton
          aria-label={t("common.delete")}
          onClick={handleDelete}
          className="text-expense-ink"
        >
          <Trash2 className="size-5" />
        </IconButton>
      </div>

      {loaded && <TransactionForm values={values} onChange={setValues} />}

      {saveError && (
        <p className="mt-3 text-sm text-expense-ink" role="alert">
          {saveError}
        </p>
      )}

      <SaveFab
        amount={amount}
        disabled={amount <= 0 || saving || !loaded}
        loading={saving}
        onClick={handleSave}
        labelKey="transactions.saveLabel"
      />
    </div>
  );
}
