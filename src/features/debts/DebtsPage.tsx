import { useTranslation } from "react-i18next";
import { Wallet } from "lucide-react";
import { EmptyState } from "@/components/ui";

export function DebtsPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8 space-y-5">
      <h1 className="h-display">{t("debts.title")}</h1>
      <EmptyState
        icon={<Wallet className="size-5" />}
        title={t("debts.empty")}
        description="Phase 7 brings the debt tracker, including USD debts to relatives with FX at payment time (see ADR-004)."
      />
    </div>
  );
}
