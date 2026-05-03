import { useTranslation } from "react-i18next";

export function AddExpensePage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8 space-y-5">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {t("expense.add")}
      </h1>
      <div className="rounded-2xl bg-surface border border-border p-5 shadow-card text-text-secondary">
        Add Expense form will live here. (Phase 5)
      </div>
    </div>
  );
}
