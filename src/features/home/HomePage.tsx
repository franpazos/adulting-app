import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Users, Scale, Wallet } from "lucide-react";
import {
  Card,
  Pill,
  SegmentedControl,
  type SegmentedOption,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { useUiStore, type Scope } from "@/store/uiStore";
import { useDbStore } from "@/store/dbStore";
import {
  categoryBreakdown,
  dashboardSummary,
  type CategorySliceRow,
} from "@/lib/calculations/dashboard";
import { debtsRepo, settlementsRepo } from "@/lib/db";

export function HomePage() {
  const { t } = useTranslation();
  const scope = useUiStore((s) => s.scope);
  const setScope = useUiStore((s) => s.setScope);
  const monthKey = useUiStore((s) => s.monthKey);
  const dbStatus = useDbStore((s) => s.status);

  const summary = useMemo(
    () =>
      dbStatus === "ready"
        ? dashboardSummary(monthKey, scope)
        : { income: 0, expenses: 0, recurring: 0, available: 0 },
    [dbStatus, monthKey, scope],
  );

  const categories = useMemo<CategorySliceRow[]>(
    () => (dbStatus === "ready" ? categoryBreakdown(monthKey, scope) : []),
    [dbStatus, monthKey, scope],
  );

  const settlements = useMemo(() => {
    if (dbStatus !== "ready") {
      return { franSamNet: 0, samHouseholdNet: 0 };
    }
    return {
      franSamNet: settlementsRepo.netBalance("FRAN", "SAM"),
      samHouseholdNet: settlementsRepo.netBalance("SAM", "HOUSEHOLD"),
    };
  }, [dbStatus, monthKey]);

  const debts = useMemo(() => {
    if (dbStatus !== "ready") return { totalEur: 0, count: 0 };
    const list = debtsRepo.list();
    // For Phase 3 the Deudas card sums only EUR debts. Multi-currency
    // display is wired properly in Phase 7.
    const eurOnly = list.filter((d) => d.currency_code === "EUR");
    return {
      totalEur: eurOnly.reduce((s, d) => s + d.current_balance, 0),
      count: list.length,
    };
  }, [dbStatus]);

  const scopeOptions: ReadonlyArray<SegmentedOption<Scope>> = [
    { value: "household", label: t("home.scope.household") },
    { value: "fran", label: t("home.scope.fran") },
    { value: "sam", label: t("home.scope.sam") },
    { value: "all", label: t("home.scope.all") },
  ];

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-5">
      <AppHeader />

      <SegmentedControl
        options={scopeOptions}
        value={scope}
        onChange={setScope}
        ariaLabel={t("home.title")}
        className="w-full justify-stretch [&>button]:flex-1"
      />

      <Card>
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center size-9 rounded-xl bg-violet/10 text-violet">
              <Users className="size-4.5" />
            </span>
            <h2 className="h-card">
              {scope === "household" ? "Cuenta conjunta" : "Resumen del mes"}
            </h2>
          </div>
          <ChevronRight className="size-4 text-text-muted mt-2" />
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Stat label="Ingresos del mes" value={summary.income} tone="positive" />
          <Stat label="Gastos del mes" value={summary.expenses} tone="expense" />
          <Stat label="Recurrentes" value={summary.recurring} />
          <Stat
            label="Disponible estimado"
            value={summary.available}
            tone="violet"
          />
        </div>
      </Card>

      <Card>
        <div className="flex items-start justify-between mb-4">
          <h2 className="h-card">Gastos por categoría</h2>
          <ChevronRight className="size-4 text-text-muted mt-1" />
        </div>
        {categories.length === 0 ? (
          <p className="t-label">Sin gastos este mes.</p>
        ) : (
          <ul className="space-y-3">
            {categories.map((c) => (
              <li
                key={c.category_id ?? c.name}
                className="flex items-center gap-3"
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: c.color ?? "#9CA3AF" }}
                />
                <span className="flex-1 text-sm">{c.name}</span>
                <span className="t-label tabular-nums">{c.percent}%</span>
                <span className="font-medium tabular-nums tracking-tight">
                  {formatEUR(c.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center size-7 rounded-lg bg-violet/10 text-violet">
              <Scale className="size-4" />
            </span>
            <h3 className="text-sm font-semibold leading-tight">
              Ajustes /<br />
              Settlements
            </h3>
          </div>
          <SettlementRow
            label="Fran ↔ Sam"
            net={settlements.franSamNet}
            namePos="Fran debe a Sam"
            nameNeg="Sam debe a Fran"
          />
          <SettlementRow
            label="Sam ↔ Hogar"
            net={settlements.samHouseholdNet}
            namePos="Sam debe al hogar"
            nameNeg="Hogar debe a Sam"
          />
        </Card>
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center size-7 rounded-lg bg-positive/10 text-positive">
              <Wallet className="size-4" />
            </span>
            <h3 className="text-sm font-semibold">Deudas</h3>
          </div>
          <div>
            <p className="t-label">Total pendiente (EUR)</p>
            <p className="t-amount">{formatEUR(debts.totalEur)}</p>
          </div>
          <Pill tone="info">{debts.count} deuda{debts.count === 1 ? "" : "s"}</Pill>
        </Card>
      </div>
    </div>
  );
}

interface StatProps {
  label: string;
  value: number;
  tone?: "default" | "positive" | "expense" | "violet";
}

function Stat({ label, value, tone = "default" }: StatProps) {
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "expense"
        ? "text-expense"
        : tone === "violet"
          ? "text-violet"
          : "text-text-primary";
  return (
    <div>
      <p className="t-label">{label}</p>
      <p className={`t-amount ${toneClass}`}>{formatEUR(value)}</p>
    </div>
  );
}

function SettlementRow({
  label,
  net,
  namePos,
  nameNeg,
}: {
  label: string;
  net: number;
  namePos: string;
  nameNeg: string;
}) {
  const display = Math.abs(net);
  const tone = net === 0 ? "text-text-secondary" : net > 0 ? "text-expense" : "text-positive";
  const name = net === 0 ? label : net > 0 ? namePos : nameNeg;
  return (
    <div>
      <p className="t-label text-xs">{name}</p>
      <p
        className={`font-display text-lg font-semibold tabular-nums ${tone}`}
      >
        {formatEUR(display)}
      </p>
    </div>
  );
}

function formatEUR(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}
