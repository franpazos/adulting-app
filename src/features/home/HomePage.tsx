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

const FAKE_AMOUNTS = {
  income: 2980,
  expenses: 1432.5,
  recurring: 620,
  available: 927.5,
};

export function HomePage() {
  const { t } = useTranslation();
  const scope = useUiStore((s) => s.scope);
  const setScope = useUiStore((s) => s.setScope);

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
            <h2 className="h-card">Cuenta conjunta</h2>
          </div>
          <ChevronRight className="size-4 text-text-muted mt-2" />
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Stat label="Ingresos del mes" value={FAKE_AMOUNTS.income} tone="positive" />
          <Stat label="Gastos del mes" value={FAKE_AMOUNTS.expenses} tone="expense" />
          <Stat label="Recurrentes" value={FAKE_AMOUNTS.recurring} />
          <Stat label="Disponible estimado" value={FAKE_AMOUNTS.available} tone="violet" />
        </div>
      </Card>

      <Card>
        <div className="flex items-start justify-between mb-4">
          <h2 className="h-card">Gastos por categoría</h2>
          <ChevronRight className="size-4 text-text-muted mt-1" />
        </div>
        <ul className="space-y-3">
          {CATEGORIES.map((c) => (
            <li key={c.name} className="flex items-center gap-3">
              <span
                className="size-2.5 rounded-full"
                style={{ background: c.color }}
              />
              <span className="flex-1 text-sm">{c.name}</span>
              <span className="t-label tabular-nums">{c.percent}%</span>
              <span className="font-medium tabular-nums tracking-tight">
                {formatEUR(c.amount)}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center size-7 rounded-lg bg-violet/10 text-violet">
              <Scale className="size-4" />
            </span>
            <h3 className="text-sm font-semibold leading-tight">
              Ajustes /<br />Settlements
            </h3>
          </div>
          <SmallStat label="Fran debe a Sam" value={20} tone="expense" />
          <SmallStat label="Sam debe al hogar" value={0} tone="positive" />
        </Card>
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center size-7 rounded-lg bg-positive/10 text-positive">
              <Wallet className="size-4" />
            </span>
            <h3 className="text-sm font-semibold">Deudas</h3>
          </div>
          <div>
            <p className="t-label">Total pendiente</p>
            <p className="t-amount">{formatEUR(450)}</p>
          </div>
          <Pill tone="info">2 deudas activas</Pill>
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

function SmallStat({ label, value, tone }: StatProps) {
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "expense"
        ? "text-expense"
        : "text-text-primary";
  return (
    <div>
      <p className="t-label text-xs">{label}</p>
      <p className={`font-display text-lg font-semibold tabular-nums ${toneClass}`}>
        {formatEUR(value)}
      </p>
    </div>
  );
}

const CATEGORIES = [
  { name: "Hogar", percent: 42, amount: 601.5, color: "#22C55E" },
  { name: "Alimentación", percent: 24, amount: 343.2, color: "#7B5CF6" },
  { name: "Transporte", percent: 15, amount: 214.75, color: "#F59E0B" },
  { name: "Ocio", percent: 10, amount: 143.8, color: "#FF7D6B" },
  { name: "Otros", percent: 9, amount: 129.25, color: "#9CA3AF" },
];

function formatEUR(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}
