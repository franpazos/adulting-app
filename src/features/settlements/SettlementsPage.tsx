/**
 * Settlements page — internal accounting view.
 * Three balance cards (Fran↔Sam, Fran↔Household, Sam↔Household) plus the
 * recent ledger activity. Visual reference:
 * docs/design-handoff/scripts/screens.jsx (`SettlementsScreen`).
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronLeft } from "lucide-react";

import { Avatar } from "@/components/Avatar";
import {
  Button,
  Card,
  CardEyebrow,
  IconButton,
  EmptyState,
} from "@/components/ui";
import { EmptyArt } from "@/components/EmptyArt";

import { settlementsRepo } from "@/lib/db";
import { useDbStore } from "@/store/dbStore";
import type { OwnerType, SettlementLedgerEntry } from "@/lib/db/types";
import { cn } from "@/lib/utils/cn";

interface BalanceLine {
  from: OwnerType;
  to: OwnerType;
  amount: number;
}

const PAIRS: ReadonlyArray<[OwnerType, OwnerType]> = [
  ["FRAN", "SAM"],
  ["FRAN", "HOUSEHOLD"],
  ["SAM", "HOUSEHOLD"],
];

export function SettlementsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const dbReady = useDbStore((s) => s.status === "ready");
  const dbVersion = useDbStore((s) => s.dbVersion);

  const balances = useMemo<BalanceLine[]>(() => {
    if (!dbReady) return [];
    return PAIRS.map(([a, b]): BalanceLine => {
      const net = settlementsRepo.netBalance(a, b);
      return net >= 0
        ? { from: a, to: b, amount: net }
        : { from: b, to: a, amount: -net };
    });
  }, [dbReady, dbVersion]);

  const open = balances.filter((b) => b.amount > 0.005);
  const totalOwed = open.reduce((s, b) => s + b.amount, 0);

  const recent = useMemo<SettlementLedgerEntry[]>(() => {
    if (!dbReady) return [];
    return settlementsRepo.list().slice(0, 6);
  }, [dbReady, dbVersion]);

  const allSquare = open.length === 0;

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-5">
      <div className="flex items-center justify-between">
        <IconButton
          aria-label={t("settlements.back")}
          onClick={() => navigate("/more")}
        >
          <ChevronLeft className="size-5" />
        </IconButton>
        <h1 className="font-display text-base font-semibold">
          {t("settlements.title")}
        </h1>
        <span className="size-10" aria-hidden />
      </div>

      <div>
        <p className="t-eyebrow">{t("settlements.outstanding")}</p>
        <p className="t-amount-lg mt-1">{formatEUR(totalOwed)}</p>
        <p className="t-label mt-1">
          {t("settlements.openCount", { count: open.length })} ·{" "}
          {t("settlements.internalNote")}
        </p>
      </div>

      {allSquare ? (
        <EmptyState
          variant="centered"
          art={<EmptyArt kind="settlements" />}
          title={t("settlements.empty.title")}
          description={t("settlements.empty.description")}
        />
      ) : (
        <div className="space-y-3">
          {open.map((b) => (
            <BalanceCard key={`${b.from}-${b.to}`} balance={b} />
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <section className="space-y-2 pt-2">
          <CardEyebrow>{t("settlements.recentActivity")}</CardEyebrow>
          <ul className="divide-y divide-border">
            {recent.map((e) => (
              <HistoryRow key={e.id} entry={e} lang={i18n.language} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function BalanceCard({ balance }: { balance: BalanceLine }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fromName = whoLabel(balance.from, t);
  const toName = whoLabel(balance.to, t);

  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-8 -right-8 size-32 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgb(var(--color-violet-tint)), transparent 70%)",
        }}
      />
      <div className="relative flex items-center gap-3">
        <div className="flex flex-col items-center gap-1.5">
          <Avatar who={balance.from} size={42} />
          <span className="text-[11px] font-semibold text-text-secondary">
            {fromName}
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center">
          <svg
            viewBox="0 0 100 22"
            preserveAspectRatio="none"
            className="w-full max-w-[120px] h-[22px]"
            aria-hidden
          >
            <line
              x1="2" y1="11" x2="92" y2="11"
              className="stroke-violet"
              strokeWidth="2"
              opacity="0.7"
            />
            <polygon points="92,11 86,7 86,15" className="fill-violet" />
          </svg>
          <p className="font-display text-2xl font-semibold tabular-nums text-violet-ink dark:text-violet-soft mt-1">
            {formatEUR(balance.amount)}
          </p>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <Avatar who={balance.to} size={42} />
          <span className="text-[11px] font-semibold text-text-secondary">
            {toName}
          </span>
        </div>
      </div>

      <div className="relative pt-3 mt-3 border-t border-border">
        <Button
          size="sm"
          block
          onClick={() =>
            navigate(
              `/settlements/settle?from=${balance.from}&to=${balance.to}`,
            )
          }
        >
          {t("settleUp.cta")}
        </Button>
      </div>
    </Card>
  );
}

function HistoryRow({
  entry,
  lang,
}: {
  entry: SettlementLedgerEntry;
  lang: string;
}) {
  const { t } = useTranslation();
  const fromName = whoLabel(entry.from_party, t);
  const toName = whoLabel(entry.to_party, t);
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="flex items-center -space-x-1.5">
        <Avatar who={entry.from_party} size={26} />
        <Avatar who={entry.to_party} size={26} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {fromName}
          <ArrowRight className="size-3 inline mx-1 text-text-muted" />
          {toName}
        </p>
        <p className="text-[11px] text-text-muted">
          {formatDate(entry.date, lang)}
          {entry.reason ? ` · ${humanReason(entry.reason, t)}` : ""}
        </p>
      </div>
      <span className="font-display text-sm font-semibold tabular-nums">
        {formatEUR(entry.amount)}
      </span>
    </li>
  );
}

function whoLabel(who: OwnerType, t: (k: string) => string): string {
  if (who === "FRAN") return t("addExpense.who.fran");
  if (who === "SAM") return t("addExpense.who.sam");
  return t("addExpense.who.household");
}

function humanReason(reason: string, t: (k: string) => string): string {
  // Reason values from `expenseAllocator` SettlementReason
  if (reason === "shared_expense_personal_source") {
    return t("settlements.reason.sharedPersonal");
  }
  if (reason === "shared_expense_personal_source_custom_split") {
    return t("settlements.reason.sharedPersonalCustom");
  }
  if (reason === "personal_expense_joint_source") {
    return t("settlements.reason.personalJoint");
  }
  if (reason === "personal_expense_other_personal_source") {
    return t("settlements.reason.personalOther");
  }
  return reason;
}

function formatDate(iso: string, lang: string): string {
  const locale = lang?.startsWith("es") ? "es-ES" : "en-US";
  return new Date(iso).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
  });
}

function formatEUR(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}

// Suppress unused `cn` warning when this file evolves.
void cn;
