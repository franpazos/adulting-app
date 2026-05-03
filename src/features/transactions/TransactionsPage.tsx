import { useTranslation } from "react-i18next";
import { Button, EmptyState } from "@/components/ui";
import { EmptyArt } from "@/components/EmptyArt";

export function TransactionsPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8 space-y-5">
      <h1 className="h-display">{t("transactions.title")}</h1>
      <EmptyState
        variant="centered"
        art={<EmptyArt kind="transactions" />}
        title={t("transactions.empty.title")}
        description={t("transactions.empty.description")}
        action={
          <Button variant="secondary" size="sm">
            {t("common.trySample")}
          </Button>
        }
      />
    </div>
  );
}
