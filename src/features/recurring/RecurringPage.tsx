/**
 * Recurring list — monthly totals plus grouped sections (incomes, expenses,
 * debt payments). Tap a row to edit, plus button to create. Deactivated
 * items are hidden by default.
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  Plus,
  ArrowDown,
  ArrowUp,
  Percent,
  Check,
  ArrowLeftRight,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Card, IconButton, Pill } from "@/components/ui";
import { Avatar, type AvatarWho } from "@/components/Avatar";
import { recurringRepo, categoriesRepo } from "@/lib/db";
import { useDbStore } from "@/store/dbStore";
import type { RecurringItem, RecurringType } from "@/lib/db/types";
import { cn } from "@/lib/utils/cn";
import { formatEUR } from "@/lib/utils/format";
import { currentMonthKey } from "@/lib/date/month";

export function RecurringPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dbReady = useDbStore((s) => s.status === "ready");
  const dbVersion = useDbStore((s) => s.dbVersion);

  // Paid/pending is always reported for the current calendar month, not
  // whatever Home is browsing. Recurring has no month picker today; if we
  // ever add one, switch this to uiStore.monthKey.
  const monthKey = currentMonthKey();

  const items = useMemo(
    () => (dbReady ? recurringRepo.list(true) : []),
    [dbReady, dbVersion],
  );
  const paidState = useMemo(
    () => (dbReady ? recurringRepo.paidStateForMonth(monthKey) : new Map()),
    [dbReady, dbVersion, monthKey],
  );

  const incomes = items.filter((i) => i.type === "INCOME");
  const expenses = items.filter((i) => i.type === "EXPENSE");
  const debtPayments = items.filter((i) => i.type === "DEBT_PAYMENT");
  const transfers = items.filter((i) => i.type === "TRANSFER");

  const totalIn = incomes.reduce((s, i) => s + i.amount, 0);
  const totalOut =
    expenses.reduce((s, i) => s + i.amount, 0) +
    debtPayments.reduce((s, i) => s + i.amount, 0);

  // Paid progress is restricted to EXPENSE recurrings. Income and debt
  // payments can't be marked paid through any UI yet, so showing them as
  // perpetually "pending" against the total would be misleading.
  const paidThisMonth = expenses.reduce(
    (s, i) => s + (paidState.has(i.id) ? i.amount : 0),
    0,
  );
  const expectedExpenses = expenses.reduce((s, i) => s + i.amount, 0);
  const paidProgress =
    expectedExpenses > 0 ? (paidThisMonth / expectedExpenses) * 100 : 0;

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-5">
      <AppHeader showMonth={false} />

      <div className="flex items-center justify-between">
        <IconButton
          aria-label={t("settlements.back")}
          onClick={() => navigate("/more")}
        >
          <ChevronLeft className="size-5" />
        </IconButton>
        <h1 className="font-display text-base font-semibold">
          {t("recurring.title")}
        </h1>
        <IconButton
          aria-label={t("recurring.new")}
          onClick={() => navigate("/recurring/new")}
          variant="violet"
          size="sm"
        >
          <Plus className="size-4" />
        </IconButton>
      </div>

      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="t-eyebrow text-positive-ink">{t("recurring.monthlyIn")}</p>
            <p className="t-amount text-positive-ink mt-1">
              +{formatEUR(totalIn)}
            </p>
          </div>
          <div>
            <p className="t-eyebrow text-expense-ink">{t("recurring.monthlyOut")}</p>
            <p className="t-amount text-expense-ink mt-1">
              −{formatEUR(totalOut)}
            </p>
          </div>
        </div>
        {expenses.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-border/60">
            <div className="flex items-baseline justify-between">
              <p className="t-eyebrow">{t("recurring.paidProgress")}</p>
              <p className="text-xs text-text-secondary tabular-nums">
                {t("recurring.paidOfExpected", {
                  paid: formatEUR(paidThisMonth),
                  total: formatEUR(expectedExpenses),
                })}
              </p>
            </div>
            <div
              className="h-1.5 rounded-full bg-surface-2 overflow-hidden"
              aria-hidden
            >
              <div
                className="h-full bg-positive-ink"
                style={{ width: `${Math.min(100, paidProgress)}%` }}
              />
            </div>
          </div>
        )}
      </Card>

      {incomes.length > 0 && (
        <Section title={t("recurring.sections.income")}>
          {incomes.map((it) => (
            <Row key={it.id} item={it} paid={paidState.has(it.id)} />
          ))}
        </Section>
      )}
      {expenses.length > 0 && (
        <Section title={t("recurring.sections.expense")}>
          {expenses.map((it) => (
            <Row key={it.id} item={it} paid={paidState.has(it.id)} />
          ))}
        </Section>
      )}
      {debtPayments.length > 0 && (
        <Section title={t("recurring.sections.debt")}>
          {debtPayments.map((it) => (
            <Row key={it.id} item={it} paid={paidState.has(it.id)} />
          ))}
        </Section>
      )}
      {transfers.length > 0 && (
        <Section title={t("recurring.sections.transfer")}>
          {transfers.map((it) => (
            <Row key={it.id} item={it} paid={paidState.has(it.id)} />
          ))}
        </Section>
      )}

      {items.length === 0 && (
        <Card variant="flat" className="text-center text-text-secondary">
          <p className="text-sm">{t("recurring.empty")}</p>
        </Card>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <p className="t-eyebrow px-1">{title}</p>
      <ul className="rounded-2xl bg-surface border border-border shadow-card divide-y divide-border overflow-hidden">
        {children}
      </ul>
    </section>
  );
}

function Row({ item, paid }: { item: RecurringItem; paid: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cat = item.category_id ? categoriesRepo.getById(item.category_id) : null;
  const tone = paid
    ? {
        bg: "bg-positive/15",
        fg: "text-positive-ink",
        icon: <Check className="size-4" strokeWidth={3} />,
      }
    : toneFor(item.type);

  return (
    <li>
      <button
        type="button"
        onClick={() => navigate(`/recurring/${item.id}`)}
        className="w-full flex items-center gap-3 px-3.5 py-3 text-left active:bg-surface-2 transition-colors"
      >
        <span
          className={cn(
            "grid place-items-center size-9 rounded-xl",
            tone.bg,
            tone.fg,
          )}
          aria-label={paid ? t("recurring.paidThisMonth") : undefined}
        >
          {tone.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{item.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Avatar who={ownerToWho(item.owner_type)} size={14} />
            <span className="text-[11px] text-text-secondary">
              {cat?.name ?? t("addExpense.categoryNone")} · {t("recurring.monthly")}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p
            className={cn(
              "font-display text-base font-semibold tabular-nums",
              item.type === "INCOME" ? "text-positive-ink" : "text-text-primary",
            )}
          >
            {item.type === "INCOME" ? "+" : ""}
            {formatEUR(item.amount)}
          </p>
          {item.type === "INCOME" ? null : (
            <Pill tone={item.type === "DEBT_PAYMENT" ? "info" : "neutral"} className="h-5 px-2 text-[10px]">
              {item.currency_code}
            </Pill>
          )}
        </div>
      </button>
    </li>
  );
}

function toneFor(type: RecurringType): {
  bg: string;
  fg: string;
  icon: React.ReactNode;
} {
  if (type === "INCOME") {
    return {
      bg: "bg-positive/10",
      fg: "text-positive-ink",
      icon: <ArrowDown className="size-4" />,
    };
  }
  if (type === "DEBT_PAYMENT") {
    return {
      bg: "bg-info/10",
      fg: "text-info-ink",
      icon: <Percent className="size-4" />,
    };
  }
  if (type === "TRANSFER") {
    return {
      bg: "bg-surface-2",
      fg: "text-text-secondary",
      icon: <ArrowLeftRight className="size-4" />,
    };
  }
  return {
    bg: "bg-expense/10",
    fg: "text-expense-ink",
    icon: <ArrowUp className="size-4" />,
  };
}

function ownerToWho(o: RecurringItem["owner_type"]): AvatarWho {
  return o;
}

