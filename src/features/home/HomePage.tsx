import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Wallet, Scale } from "lucide-react";
import {
  Card,
  Pill,
  SegmentedControl,
  type SegmentedOption,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { Avatar } from "@/components/Avatar";
import { useUiStore, type Scope } from "@/store/uiStore";
import { useDbStore } from "@/store/dbStore";
import {
  accountBalance,
  accountMonthlyFlow,
  categoryBreakdown,
  monthlySummary,
  type CategorySliceRow,
  type MonthlySummary,
} from "@/lib/calculations";
import { accountsRepo, debtsRepo, settlementsRepo } from "@/lib/db";
import type { OwnerType } from "@/lib/db/types";
import { DonutChart } from "@/components/charts/DonutChart";
import { CompareBar } from "@/components/charts/CompareBar";

const EMPTY_SUMMARY: MonthlySummary = {
  income: 0,
  expenses: 0,
  recurring: 0,
  debtPayments: 0,
  available: 0,
};

export function HomePage() {
  const { t } = useTranslation();
  const scope = useUiStore((s) => s.scope);
  const setScope = useUiStore((s) => s.setScope);
  const monthKey = useUiStore((s) => s.monthKey);
  const dbStatus = useDbStore((s) => s.status);
  const dbVersion = useDbStore((s) => s.dbVersion);
  const ready = dbStatus === "ready";

  // Joint account snapshot (spec §6.1.1)
  const joint = useMemo(() => {
    if (!ready) return null;
    const accounts = accountsRepo.list();
    const jointAccount = accounts.find((a) => a.type === "JOINT");
    if (!jointAccount) return null;
    const balance = accountBalance(
      jointAccount.id,
      jointAccount.initial_balance,
    );
    const flow = accountMonthlyFlow(jointAccount.id, monthKey);
    return {
      account: jointAccount,
      balance,
      inflow: flow.inflow,
      outflow: flow.outflow,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, dbVersion, monthKey]);

  // Personal summaries (spec §6.1.3)
  const franSummary = useMemo(
    () => (ready ? monthlySummary(monthKey, "fran") : EMPTY_SUMMARY),
    [ready, dbVersion, monthKey],
  );
  const samSummary = useMemo(
    () => (ready ? monthlySummary(monthKey, "sam") : EMPTY_SUMMARY),
    [ready, dbVersion, monthKey],
  );

  // Active scope summary — used by the optional context panel.
  const scopeSummary = useMemo(
    () => (ready ? monthlySummary(monthKey, scope) : EMPTY_SUMMARY),
    [ready, dbVersion, monthKey, scope],
  );

  // Category breakdown follows the active scope.
  const categories = useMemo<CategorySliceRow[]>(
    () => (ready ? categoryBreakdown(monthKey, scope) : []),
    [ready, dbVersion, monthKey, scope],
  );

  // Settlements net balances (spec §6.1.4).
  const settlements = useMemo(() => {
    if (!ready) {
      return { franSamNet: 0, franHouseholdNet: 0, samHouseholdNet: 0 };
    }
    return {
      franSamNet: settlementsRepo.netBalance("FRAN", "SAM"),
      franHouseholdNet: settlementsRepo.netBalance("FRAN", "HOUSEHOLD"),
      samHouseholdNet: settlementsRepo.netBalance("SAM", "HOUSEHOLD"),
    };
  }, [ready, dbVersion]);

  // Debt totals by owner (spec §6.1.5).
  const debtsByOwner = useMemo(() => {
    if (!ready) return null;
    const list = debtsRepo.list(true);
    const out: Record<OwnerType, Record<string, number>> = {
      FRAN: {},
      SAM: {},
      HOUSEHOLD: {},
    };
    let monthly = 0;
    for (const d of list) {
      const bucket = out[d.owner_type];
      bucket[d.currency_code] =
        (bucket[d.currency_code] ?? 0) + d.current_balance;
      // Sum minimums in EUR-equivalent for the rough headline. Multi-currency
      // can be itemized on the /debts page.
      if (d.currency_code === "EUR" && d.minimum_payment != null) {
        monthly += d.minimum_payment;
      }
    }
    return { byOwner: out, monthly, count: list.length };
  }, [ready, dbVersion]);

  const scopeOptions: ReadonlyArray<SegmentedOption<Scope>> = [
    { value: "household", label: t("home.scope.household") },
    { value: "fran", label: t("home.scope.fran") },
    { value: "sam", label: t("home.scope.sam") },
    { value: "all", label: t("home.scope.all") },
  ];

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-5">
      <AppHeader />

      {/* §6.1.1 Joint snapshot */}
      {joint && (
        <JointSnapshotCard
          balance={joint.balance}
          inflow={joint.inflow}
          outflow={joint.outflow}
          currency={joint.account.currency_code}
          accountName={joint.account.name}
        />
      )}

      {/* §6.1.3 Personal summaries side by side */}
      <div className="grid grid-cols-2 gap-3">
        <PersonalCard
          who="FRAN"
          name={t("addExpense.who.fran")}
          summary={franSummary}
        />
        <PersonalCard
          who="SAM"
          name={t("addExpense.who.sam")}
          summary={samSummary}
        />
      </div>

      <SegmentedControl
        options={scopeOptions}
        value={scope}
        onChange={setScope}
        ariaLabel={t("home.title")}
        className="w-full justify-stretch [&>button]:flex-1"
      />

      {/* §6.1.6 Category breakdown — scope-aware */}
      <Card>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="h-card">{t("home.categoryTitle")}</h2>
            <p className="t-label text-xs mt-0.5">
              {t("home.scopeLabel", {
                scope: t(`home.scope.${scope}`),
              })}
            </p>
          </div>
          <Link
            to="/transactions"
            aria-label={t("home.openTransactions")}
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/60"
          >
            <ChevronRight className="size-4 text-text-muted mt-1" />
          </Link>
        </div>
        {categories.length === 0 ? (
          <p className="t-label">{t("home.noExpenses")}</p>
        ) : (
          <div className="flex items-center gap-5">
            <DonutChart
              size={56}
              thickness={0.36}
              ariaLabel={t("home.categoryChartAria")}
              slices={categories.map((c) => ({
                id: c.category_id ?? c.name,
                percent: c.percent,
                color: c.color ?? "rgb(var(--color-text-muted))",
              }))}
              centerLabel={
                <span className="text-[10px] font-medium text-text-secondary leading-tight">
                  {categories.length}
                  <br />
                  cat.
                </span>
              }
            />
            <ul className="flex-1 space-y-2.5 min-w-0">
              {categories.slice(0, 6).map((c) => (
                <li
                  key={c.category_id ?? c.name}
                  className="flex items-center gap-2.5 min-w-0"
                >
                  <span
                    className="size-2.5 rounded-full shrink-0"
                    style={{ background: c.color ?? "#9CA3AF" }}
                  />
                  <span className="flex-1 text-sm truncate">{c.name}</span>
                  <span className="t-label tabular-nums shrink-0">
                    {c.percent}%
                  </span>
                  <span className="font-medium tabular-nums tracking-tight text-sm shrink-0">
                    {formatEUR(c.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {(scopeSummary.income > 0 || scopeSummary.expenses > 0) && (
          <div className="mt-5 space-y-1">
            <CompareBar
              positive={scopeSummary.income}
              negative={scopeSummary.expenses}
              ariaLabel={t("home.compareAria", {
                income: scopeSummary.income,
                expenses: scopeSummary.expenses,
              })}
            />
            <div className="flex justify-between text-[11px] text-text-secondary">
              <span>+{formatEUR(scopeSummary.income)}</span>
              <span>−{formatEUR(scopeSummary.expenses)}</span>
            </div>
          </div>
        )}
      </Card>

      {/* §6.1.4 Settlements + §6.1.5 Debt summary */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/settlements"
          aria-label={t("home.openSettlements")}
          className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/60"
        >
          <Card className="space-y-3 tap-card h-full">
            <div className="flex items-center gap-2">
              <span className="grid place-items-center size-7 rounded-lg bg-violet/10 text-violet">
                <Scale className="size-4" />
              </span>
              <h3 className="text-sm font-semibold leading-tight">
                {t("home.settlementsTitle")}
              </h3>
            </div>
            <SettlementRow
              net={settlements.franSamNet}
              label={t("settlements.owes", {
                from: t("addExpense.who.fran"),
                to: t("addExpense.who.sam"),
              })}
              labelInverse={t("settlements.owes", {
                from: t("addExpense.who.sam"),
                to: t("addExpense.who.fran"),
              })}
            />
            <SettlementRow
              net={settlements.samHouseholdNet}
              label={t("settlements.owes", {
                from: t("addExpense.who.sam"),
                to: t("addExpense.who.household"),
              })}
              labelInverse={t("settlements.owes", {
                from: t("addExpense.who.household"),
                to: t("addExpense.who.sam"),
              })}
            />
          </Card>
        </Link>

        <Link
          to="/debts"
          aria-label={t("home.openDebts")}
          className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/60"
        >
          <Card className="space-y-3 tap-card h-full">
            <div className="flex items-center gap-2">
              <span className="grid place-items-center size-7 rounded-lg bg-positive/10 text-positive">
                <Wallet className="size-4" />
              </span>
              <h3 className="text-sm font-semibold">
                {t("home.debtsTitle")}
              </h3>
            </div>
            {debtsByOwner ? (
              <ul className="space-y-1.5">
                <DebtOwnerLine
                  who="FRAN"
                  totals={debtsByOwner.byOwner.FRAN}
                />
                <DebtOwnerLine
                  who="SAM"
                  totals={debtsByOwner.byOwner.SAM}
                />
                <DebtOwnerLine
                  who="HOUSEHOLD"
                  totals={debtsByOwner.byOwner.HOUSEHOLD}
                />
              </ul>
            ) : (
              <p className="t-label">—</p>
            )}
            {debtsByOwner && debtsByOwner.monthly > 0 && (
              <Pill tone="info" className="mt-1">
                {t("home.monthlyDebt", { amount: formatEUR(debtsByOwner.monthly) })}
              </Pill>
            )}
          </Card>
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section components
// ─────────────────────────────────────────────────────────────────────────────

function JointSnapshotCard({
  balance,
  inflow,
  outflow,
  currency,
  accountName,
}: {
  balance: number;
  inflow: number;
  outflow: number;
  currency: string;
  accountName: string;
}) {
  const { t } = useTranslation();
  const fmt = (n: number) =>
    new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(n);

  return (
    <Link
      to="/accounts"
      aria-label={t("home.openAccounts")}
      className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/60"
    >
      <Card className="tap-card">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <Avatar who="JOINT" size={36} />
            <div>
              <p className="t-label text-xs">{t("home.jointBalanceLabel")}</p>
              <h2 className="h-card">{accountName}</h2>
            </div>
          </div>
          <ChevronRight className="size-4 text-text-muted mt-1" />
        </div>
        <p className="t-amount-lg">{fmt(balance)}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="t-label">{t("home.inflowMonth")}</p>
            <p className="font-display text-base font-semibold tabular-nums text-positive">
              +{fmt(inflow)}
            </p>
          </div>
          <div>
            <p className="t-label">{t("home.outflowMonth")}</p>
            <p className="font-display text-base font-semibold tabular-nums text-expense">
              −{fmt(outflow)}
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function PersonalCard({
  who,
  name,
  summary,
}: {
  who: "FRAN" | "SAM";
  name: string;
  summary: MonthlySummary;
}) {
  const { t } = useTranslation();
  const route = who === "FRAN" ? "/transactions" : "/transactions";
  return (
    <Link
      to={route}
      aria-label={t("home.openPersonal", { name })}
      className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/60"
    >
      <Card className="space-y-2.5 tap-card h-full">
        <div className="flex items-center gap-2">
          <Avatar who={who} size={28} />
          <h3 className="text-sm font-semibold">{name}</h3>
        </div>
        <MiniStat
          label={t("home.statIncome")}
          value={summary.income}
          tone="positive"
        />
        <MiniStat
          label={t("home.statExpenses")}
          value={summary.expenses}
          tone="expense"
        />
        <MiniStat
          label={t("home.statRecurring")}
          value={summary.recurring}
        />
        <div className="pt-1 border-t border-border/60">
          <MiniStat
            label={t("home.statAvailable")}
            value={summary.available}
            tone="violet"
            big
          />
        </div>
      </Card>
    </Link>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
  big = false,
}: {
  label: string;
  value: number;
  tone?: "default" | "positive" | "expense" | "violet";
  big?: boolean;
}) {
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "expense"
        ? "text-expense"
        : tone === "violet"
          ? "text-violet"
          : "text-text-primary";
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="t-label text-[11px]">{label}</span>
      <span
        className={`${
          big
            ? "font-display text-base font-semibold"
            : "text-sm font-medium"
        } tabular-nums tracking-tight ${toneClass}`}
      >
        {formatEUR(value)}
      </span>
    </div>
  );
}

function SettlementRow({
  net,
  label,
  labelInverse,
}: {
  net: number;
  label: string;
  labelInverse: string;
}) {
  const display = Math.abs(net);
  const tone =
    net === 0
      ? "text-text-secondary"
      : net > 0
        ? "text-expense"
        : "text-positive";
  const name = net === 0 ? "—" : net > 0 ? label : labelInverse;
  return (
    <div>
      <p className="t-label text-[11px] truncate">{name}</p>
      <p
        className={`font-display text-lg font-semibold tabular-nums ${tone}`}
      >
        {formatEUR(display)}
      </p>
    </div>
  );
}

function DebtOwnerLine({
  who,
  totals,
}: {
  who: OwnerType;
  totals: Record<string, number>;
}) {
  const { t } = useTranslation();
  const entries = Object.entries(totals);
  const label =
    who === "FRAN"
      ? t("addExpense.who.fran")
      : who === "SAM"
        ? t("addExpense.who.sam")
        : t("addExpense.who.household");
  return (
    <li className="flex items-center justify-between gap-2 text-xs">
      <span className="t-label">{label}</span>
      {entries.length === 0 ? (
        <span className="text-text-muted">—</span>
      ) : (
        <span className="font-medium tabular-nums tracking-tight flex flex-wrap gap-1.5 justify-end">
          {entries.map(([code, total]) => (
            <span key={code}>
              {new Intl.NumberFormat("es-ES", {
                style: "currency",
                currency: code,
                minimumFractionDigits: 0,
              }).format(total)}
            </span>
          ))}
        </span>
      )}
    </li>
  );
}

function formatEUR(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}
