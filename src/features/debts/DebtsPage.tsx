import { useTranslation } from "react-i18next";
import { Button, EmptyState } from "@/components/ui";
import { EmptyArt } from "@/components/EmptyArt";
import { debtsRepo } from "@/lib/db";
import { useDbStore } from "@/store/dbStore";

export function DebtsPage() {
  const { t } = useTranslation();
  const dbReady = useDbStore((s) => s.status === "ready");
  const debts = dbReady ? debtsRepo.list() : [];

  if (debts.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 pt-6 pb-8 space-y-5">
        <h1 className="h-display">{t("debts.title")}</h1>
        <EmptyState
          variant="centered"
          art={<EmptyArt kind="debts" />}
          title={t("debts.empty.title")}
          description={t("debts.empty.description")}
          action={<Button size="sm">{t("debts.empty.action")}</Button>}
        />
      </div>
    );
  }

  // Phase 7 will replace this stub with the full debts list (FX UI etc.)
  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8 space-y-5">
      <h1 className="h-display">{t("debts.title")}</h1>
      <ul className="space-y-2">
        {debts.map((d) => (
          <li
            key={d.id}
            className="rounded-2xl bg-surface border border-border shadow-card p-4 flex items-center justify-between"
          >
            <div>
              <p className="font-medium">{d.name}</p>
              <p className="t-label">{d.owner_type} · {d.currency_code}</p>
            </div>
            <p className="font-display text-lg font-semibold tabular-nums">
              {formatAmount(d.current_balance, d.currency_code)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatAmount(n: number, currency: string): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(n);
}
