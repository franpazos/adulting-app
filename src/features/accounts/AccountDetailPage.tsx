/**
 * Detail screen for a single account. Shows the current balance,
 * monthly flow (in / out / net), and the audit trail of manual
 * balance calibrations. Trigger of the calibration sheet lives here
 * (and only here) — the AccountsPage index keeps a clean look.
 *
 * "Ver movimientos →" jumps to /transactions?source=<account_id> so
 * the user reuses the existing list + filter pipeline instead of
 * re-implementing it in a sub-section.
 */

import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ChevronLeft,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { Avatar, type AvatarWho } from "@/components/Avatar";
import {
  Button,
  Card,
  CardEyebrow,
  IconButton,
  Pill,
  Sheet,
} from "@/components/ui";
import { accountsRepo, accountAdjustmentsRepo } from "@/lib/db";
import type { Account, AccountAdjustment } from "@/lib/db/types";
import { useDbStore } from "@/store/dbStore";
import { useUiStore } from "@/store/uiStore";
import { accountBalance, accountMonthlyFlow } from "@/lib/calculations";
import { formatMoney } from "@/lib/utils/format";
import { AccountAdjustSheet } from "./AccountAdjustSheet";

export function AccountDetailPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const dbReady = useDbStore((s) => s.status === "ready");
  const dbVersion = useDbStore((s) => s.dbVersion);
  const bumpVersion = useDbStore((s) => s.bumpVersion);
  const monthKey = useUiStore((s) => s.monthKey);

  const account = useMemo<Account | null>(
    () => (dbReady && id ? accountsRepo.getById(id) : null),
    [dbReady, dbVersion, id],
  );

  const balance = useMemo(
    () => (account ? accountBalance(account.id, account.initial_balance) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account?.id, dbVersion],
  );

  const flow = useMemo(
    () =>
      account
        ? accountMonthlyFlow(account.id, monthKey)
        : { inflow: 0, outflow: 0 },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account?.id, monthKey, dbVersion],
  );

  const adjustments = useMemo(
    () => (account ? accountAdjustmentsRepo.listForAccount(account.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account?.id, dbVersion],
  );

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  if (!account) {
    return (
      <div className="mx-auto max-w-md px-4 pt-8 space-y-3">
        <AppHeader showMonth={false} />
        <p className="t-label">{t("accounts.detail.notFound")}</p>
        <Button variant="ghost" onClick={() => navigate("/accounts")}>
          {t("accounts.detail.backToList")}
        </Button>
      </div>
    );
  }

  const who: AvatarWho = whoFromAccount(account);
  const net = flow.inflow - flow.outflow;
  const lang = i18n.language?.startsWith("es") ? "es" : "en";

  function confirmDelete(adjId: string) {
    accountAdjustmentsRepo.softDelete(adjId);
    bumpVersion();
    setPendingDeleteId(null);
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-5">
      <AppHeader />

      <div className="flex items-center justify-between">
        <IconButton
          aria-label={t("accounts.detail.back")}
          onClick={() => navigate("/accounts")}
        >
          <ChevronLeft className="size-5" />
        </IconButton>
        <h1 className="font-display text-base font-semibold truncate px-2">
          {account.name}
        </h1>
        <span className="size-10" aria-hidden />
      </div>

      {/* Header card: avatar + balance + monthly flow */}
      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar who={who} size={44} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{account.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <Pill tone="neutral" className="h-5 px-2 text-[10px]">
                {account.type}
              </Pill>
              <Pill
                tone={account.currency_code === "EUR" ? "neutral" : "info"}
                className="h-5 px-2 text-[10px]"
              >
                {account.currency_code}
              </Pill>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-border">
          <p className="t-label text-xs">
            {t("accounts.estimatedBalance")}
          </p>
          <p className="font-display text-3xl font-semibold tabular-nums mt-1">
            {formatMoney(balance, account.currency_code)}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2">
          <FlowStat
            label={t("accounts.detail.inflow")}
            value={formatMoney(flow.inflow, account.currency_code)}
            tone="positive"
          />
          <FlowStat
            label={t("accounts.detail.outflow")}
            value={formatMoney(flow.outflow, account.currency_code)}
            tone="expense"
          />
          <FlowStat
            label={t("accounts.detail.net")}
            value={formatMoney(net, account.currency_code, {
              signDisplay: "exceptZero",
            })}
            tone={net >= 0 ? "positive" : "expense"}
          />
        </div>
      </Card>

      {/* CTAs */}
      <div className="space-y-2">
        <Button block size="lg" onClick={() => setAdjustOpen(true)}>
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="size-4" />
            {t("accounts.detail.calibrateCta")}
          </span>
        </Button>
        <Button
          block
          size="lg"
          variant="ghost"
          className="border border-border"
          onClick={() => navigate(`/transactions?source=${account.id}`)}
        >
          <span className="inline-flex items-center gap-2">
            {t("accounts.detail.viewTransactions")}
            <ArrowRight className="size-4" />
          </span>
        </Button>
      </div>

      {/* Audit trail */}
      <section className="space-y-2">
        <CardEyebrow>{t("accounts.detail.adjustmentsTitle")}</CardEyebrow>
        {adjustments.length === 0 ? (
          <Card>
            <p className="t-label">{t("accounts.detail.adjustmentsEmpty")}</p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {adjustments.map((a) => (
              <li key={a.id}>
                <AdjustmentRow
                  adjustment={a}
                  currency={account.currency_code}
                  lang={lang}
                  onDelete={() => setPendingDeleteId(a.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <AccountAdjustSheet
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        account={account}
        currentBalance={balance}
        onSaved={() => bumpVersion()}
      />

      <Sheet
        open={!!pendingDeleteId}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        side="center"
        title={t("accounts.detail.deleteConfirmTitle")}
        description={t("accounts.detail.deleteConfirmDescription")}
      >
        <div className="flex flex-col gap-2 mt-2">
          <Button
            block
            size="lg"
            onClick={() => pendingDeleteId && confirmDelete(pendingDeleteId)}
            className="bg-expense text-white"
          >
            {t("accounts.detail.deleteConfirmAction")}
          </Button>
          <Button
            block
            size="lg"
            variant="ghost"
            onClick={() => setPendingDeleteId(null)}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function FlowStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "expense" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "text-positive-ink"
      : tone === "expense"
        ? "text-expense-ink"
        : "text-text-primary";
  return (
    <div className="rounded-2xl border border-border bg-surface px-3 py-2">
      <p className="t-label text-[10px] uppercase tracking-wide">{label}</p>
      <p
        className={`font-display text-sm font-semibold tabular-nums mt-1 ${toneClass}`}
      >
        {value}
      </p>
    </div>
  );
}

function AdjustmentRow({
  adjustment,
  currency,
  lang,
  onDelete,
}: {
  adjustment: AccountAdjustment;
  currency: string;
  lang: "en" | "es";
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const positive = adjustment.delta >= 0;
  const dateLabel = formatDate(adjustment.date, lang);

  return (
    <Card>
      <div className="flex items-start gap-3">
        <div
          className={`mt-1 size-9 rounded-full grid place-items-center ${
            positive
              ? "bg-positive/15 text-positive-ink"
              : "bg-expense/15 text-expense-ink"
          }`}
          aria-hidden
        >
          <SlidersHorizontal className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold text-sm">
              {formatMoney(adjustment.delta, currency, {
                signDisplay: "exceptZero",
              })}
            </p>
            <span className="t-label text-[11px]">{dateLabel}</span>
          </div>
          <p className="t-label text-xs mt-0.5">
            {t("accounts.detail.targetedLabel", {
              value: formatMoney(adjustment.target_balance, currency),
            })}
          </p>
          {adjustment.notes && (
            <p className="text-xs text-text-secondary mt-1 break-words">
              {adjustment.notes}
            </p>
          )}
        </div>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t("accounts.detail.deleteAria")}
          onClick={onDelete}
        >
          <Trash2 className="size-4 text-text-secondary" />
        </IconButton>
      </div>
    </Card>
  );
}

function whoFromAccount(a: Account): AvatarWho {
  if (a.type === "JOINT") return "JOINT";
  if (a.name.toLowerCase().includes("fran")) return "FRAN";
  if (a.name.toLowerCase().includes("sam")) return "SAM";
  return "JOINT";
}

function formatDate(iso: string, lang: "en" | "es"): string {
  // iso may be YYYY-MM-DD or a full timestamp; new Date handles both.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}
