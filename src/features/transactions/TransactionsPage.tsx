import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ListChecks } from "lucide-react";

import { EmptyState } from "@/components/ui";
import { EmptyArt } from "@/components/EmptyArt";
import { AppHeader } from "@/components/AppHeader";
import { TransactionRow } from "./TransactionRow";

import { transactionsRepo } from "@/lib/db";
import { useUiStore } from "@/store/uiStore";
import { useDbStore } from "@/store/dbStore";
import { formatMonthLabel } from "@/lib/date/month";

export function TransactionsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("es") ? "es" : "en";
  const dbReady = useDbStore((s) => s.status === "ready");
  const dbVersion = useDbStore((s) => s.dbVersion);
  const monthKey = useUiStore((s) => s.monthKey);

  const txs = useMemo(
    () => (dbReady ? transactionsRepo.listByMonth(monthKey) : []),
    [dbReady, dbVersion, monthKey],
  );

  // Pre-compute the "shared" flag (more than one allocation row) for each
  // transaction in one pass to avoid N queries during render.
  const sharedSet = useMemo(() => {
    const set = new Set<string>();
    if (!dbReady) return set;
    for (const tx of txs) {
      const allocations = transactionsRepo.allocationsFor(tx.id);
      if (allocations.length > 1) set.add(tx.id);
    }
    return set;
  }, [dbReady, dbVersion, txs]);

  if (txs.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-5">
        <AppHeader />
        <EmptyState
          variant="centered"
          art={<EmptyArt kind="transactions" />}
          title={t("transactions.empty.title")}
          description={t("transactions.empty.description")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-5">
      <AppHeader />

      <div className="flex items-baseline justify-between">
        <h1 className="h-display">{t("transactions.title")}</h1>
        <span className="t-label">
          {formatMonthLabel(monthKey, lang as "en" | "es")}
        </span>
      </div>

      <div className="flex items-center gap-2 text-text-secondary">
        <ListChecks className="size-4" />
        <span className="t-label">{t("transactions.count", { count: txs.length })}</span>
      </div>

      <ul className="space-y-2">
        {txs.map((tx) => (
          <li key={tx.id}>
            <TransactionRow tx={tx} shared={sharedSet.has(tx.id)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
