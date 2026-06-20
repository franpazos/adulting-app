import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Plus } from "lucide-react";

import { Button, Card, EmptyState, IconButton, Pill } from "@/components/ui";
import { Avatar, type AvatarWho } from "@/components/Avatar";
import { EmptyArt } from "@/components/EmptyArt";
import { AppHeader } from "@/components/AppHeader"
import { debtsRepo } from "@/lib/db";
import type { Debt, OwnerType } from "@/lib/db/types";
import { useDbStore } from "@/store/dbStore";
import { cn } from "@/lib/utils/cn";
import { formatMoney as formatAmount } from "@/lib/utils/format";

type OwnerTotals = Record<OwnerType, Record<string, number>>;

export function DebtsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dbReady = useDbStore((s) => s.status === "ready");
  const dbVersion = useDbStore((s) => s.dbVersion);

  const allDebts = useMemo(
    () => (dbReady ? debtsRepo.list(false) : []),
    [dbReady, dbVersion],
  );
  const debts = useMemo(() => allDebts.filter((d) => d.is_active), [allDebts]);
  const archived = useMemo(
    () => allDebts.filter((d) => !d.is_active),
    [allDebts],
  );

  // Group by currency for the totals card.
  const totalsByCurrency = useMemo(() => {
    const out: Record<string, number> = {};
    for (const d of debts) {
      out[d.currency_code] = (out[d.currency_code] ?? 0) + d.current_balance;
    }
    return out;
  }, [debts]);

  // Per-owner totals (spec §6.6) — separate currency rollups per owner so
  // a USD debt for Sam doesn't get summed with a EUR debt.
  const totalsByOwner = useMemo<OwnerTotals>(() => {
    const out: OwnerTotals = { FRAN: {}, SAM: {}, HOUSEHOLD: {} };
    for (const d of debts) {
      const bucket = out[d.owner_type as OwnerType];
      bucket[d.currency_code] =
        (bucket[d.currency_code] ?? 0) + d.current_balance;
    }
    return out;
  }, [debts]);

  // Sum the minimum_payment (in the debt's own currency) per currency.
  // Spec §6.6: "monthly debt payment total".
  const monthlyByCurrency = useMemo(() => {
    const out: Record<string, number> = {};
    for (const d of debts) {
      if (d.minimum_payment != null) {
        out[d.currency_code] =
          (out[d.currency_code] ?? 0) + d.minimum_payment;
      }
    }
    return out;
  }, [debts]);

  if (allDebts.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 pt-6 pb-8 space-y-5">
        <AppHeader showMonth={false} />
        <h1 className="h-display">{t("debts.title")}</h1>
        <EmptyState
          variant="centered"
          art={<EmptyArt kind="debts" />}
          title={t("debts.empty.title")}
          description={t("debts.empty.description")}
          action={
            <Button size="sm" onClick={() => navigate("/debts/new")}>
              {t("debts.empty.action")}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-5">
      <AppHeader showMonth={false} />
      
      <div className="flex items-center justify-between">
        <h1 className="h-display">{t("debts.title")}</h1>
        <IconButton
          aria-label={t("debts.add")}
          variant="violet"
          size="sm"
          onClick={() => navigate("/debts/new")}
        >
          <Plus className="size-4" />
        </IconButton>
      </div>

      {debts.length > 0 && (
        <Card className="space-y-2">
          <p className="t-eyebrow">{t("debts.totalOutstanding")}</p>
          <div className="flex flex-wrap gap-3 items-baseline">
            {Object.entries(totalsByCurrency).map(([code, total]) => (
              <span key={code} className="t-amount tabular-nums">
                {formatAmount(total, code)}
              </span>
            ))}
          </div>
          <p className="t-label">
            {t("debts.summary", { count: debts.length })}
          </p>
        </Card>
      )}

      {debts.length > 0 && (
        <Card className="space-y-3">
          <p className="t-eyebrow">{t("debts.byOwner")}</p>
          <ul className="divide-y divide-border/60">
          <OwnerRow
            who="FRAN"
            label={t("debts.owner.fran")}
            totals={totalsByOwner.FRAN}
          />
          <OwnerRow
            who="SAM"
            label={t("debts.owner.sam")}
            totals={totalsByOwner.SAM}
          />
          <OwnerRow
            who="HOUSEHOLD"
            label={t("debts.owner.household")}
            totals={totalsByOwner.HOUSEHOLD}
          />
        </ul>
          {Object.keys(monthlyByCurrency).length > 0 && (
            <div className="pt-2 mt-1 border-t border-border/60 flex items-baseline justify-between gap-3">
              <span className="t-label">{t("debts.monthlyTotal")}</span>
              <span className="font-medium tabular-nums tracking-tight text-sm flex flex-wrap gap-2 justify-end">
                {Object.entries(monthlyByCurrency).map(([code, total]) => (
                  <span key={code}>{formatAmount(total, code)}</span>
                ))}
              </span>
            </div>
          )}
        </Card>
      )}

      {debts.length > 0 && (
        <ul className="space-y-2">
          {debts.map((d) => (
            <li key={d.id}>
              <DebtRow debt={d} onClick={() => navigate(`/debts/${d.id}`)} />
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="t-eyebrow px-1">
            {t("debts.archivedHeader", { count: archived.length })}
          </h2>
          <ul className="space-y-2">
            {archived.map((d) => (
              <li key={d.id}>
                <DebtRow
                  debt={d}
                  archived
                  onClick={() => navigate(`/debts/${d.id}`)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function OwnerRow({
  who,
  label,
  totals,
}: {
  who: AvatarWho;
  label: string;
  totals: Record<string, number>;
}) {
  const entries = Object.entries(totals);
  return (
    <li className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
      <Avatar who={who} size={28} />
      <span className="flex-1 text-sm">{label}</span>
      {entries.length === 0 ? (
        <span className="t-label tabular-nums">—</span>
      ) : (
        <span className="font-medium tabular-nums tracking-tight text-sm flex flex-wrap gap-2 justify-end">
          {entries.map(([code, total]) => (
            <span key={code}>{formatAmount(total, code)}</span>
          ))}
        </span>
      )}
    </li>
  );
}

function DebtRow({
  debt,
  onClick,
  archived = false,
}: {
  debt: Debt;
  onClick: () => void;
  archived?: boolean;
}) {
  const { t } = useTranslation();
  const owner = debt.owner_type as AvatarWho;
  const isUsd = debt.currency_code === "USD";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-3 rounded-2xl",
        "bg-surface border border-border shadow-card",
        "active:scale-[0.99] transition-transform text-left",
        archived && "opacity-60 grayscale",
      )}
    >
      <Avatar who={owner} size={40} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{debt.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {archived ? (
            <Pill tone="positive" className="h-5 px-2 text-[10px]">
              {t("debts.archivedBadge")}
            </Pill>
          ) : (
            <Pill
              tone={isUsd ? "info" : "neutral"}
              className="h-5 px-2 text-[10px]"
            >
              {debt.currency_code}
            </Pill>
          )}
          {!archived && debt.minimum_payment != null && (
            <span className="text-[11px] text-text-secondary">
              min {formatAmount(debt.minimum_payment, debt.currency_code)}
            </span>
          )}
        </div>
      </div>
      <span className="font-display text-base font-semibold tabular-nums">
        {formatAmount(debt.current_balance, debt.currency_code)}
      </span>
      <ChevronRight className="size-4 text-text-muted ml-1" />
    </button>
  );
}

