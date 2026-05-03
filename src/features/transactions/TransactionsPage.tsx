import { useTranslation } from "react-i18next";
import { ListChecks } from "lucide-react";
import { EmptyState } from "@/components/ui";

export function TransactionsPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8 space-y-5">
      <h1 className="h-display">{t("transactions.title")}</h1>
      <EmptyState
        icon={<ListChecks className="size-5" />}
        title={t("transactions.empty")}
        description="Phase 6 wires the full transactions list with filters, search, edit and delete."
      />
    </div>
  );
}
