/**
 * Debt detail — info card, payment history, "Pay" CTA.
 * Pay button routes to /debts/:id/pay (PayDebtPage handles the FX flow).
 */

import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Wallet } from "lucide-react";

import { Avatar } from "@/components/Avatar";
import { Button, Card, CardEyebrow, IconButton, Pill } from "@/components/ui";
import { debtsRepo, debtPaymentsRepo } from "@/lib/db";
import { useDbStore } from "@/store/dbStore";
import { formatMoney as formatAmount, formatRate } from "@/lib/utils/format";

export function DebtDetailPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const dbReady = useDbStore((s) => s.status === "ready");
  const dbVersion = useDbStore((s) => s.dbVersion);

  const debt = useMemo(
    () => (dbReady && id ? debtsRepo.getById(id) : null),
    [dbReady, dbVersion, id],
  );
  const payments = useMemo(
    () => (dbReady && id ? debtPaymentsRepo.listForDebt(id) : []),
    [dbReady, dbVersion, id],
  );

  if (!debt) {
    return (
      <div className="mx-auto max-w-md px-4 pt-8">
        <p className="t-label">{t("debts.notFound")}</p>
        <Button
          variant="ghost"
          className="mt-3"
          onClick={() => navigate("/debts")}
        >
          {t("debts.backToList")}
        </Button>
      </div>
    );
  }

  const paid = debt.original_amount - debt.current_balance;
  const progress =
    debt.original_amount > 0
      ? Math.max(0, Math.min(100, (paid / debt.original_amount) * 100))
      : 0;

  return (
    <div className="mx-auto max-w-md px-4 pb-32 space-y-5">
      <div className="flex items-center justify-between pt-4 pb-2">
        <IconButton
          aria-label={t("settlements.back")}
          onClick={() => navigate("/debts")}
        >
          <ChevronLeft className="size-5" />
        </IconButton>
        <h1 className="font-display text-base font-semibold">
          {t("debts.detailTitle")}
        </h1>
        <span className="size-10" aria-hidden />
      </div>

      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <Avatar who={debt.owner_type} size={42} />
          <div className="flex-1 min-w-0">
            <p className="font-display text-lg font-semibold truncate">
              {debt.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <Pill
                tone={debt.currency_code === "USD" ? "info" : "neutral"}
                className="h-5 px-2 text-[10px]"
              >
                {debt.currency_code}
              </Pill>
              <span className="text-[11px] text-text-secondary">
                {t(`addExpense.who.${ownerKey(debt.owner_type)}`)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-baseline justify-between pt-2">
          <div>
            <p className="t-eyebrow">{t("debts.currentBalance")}</p>
            <p className="t-amount-lg mt-1">
              {formatAmount(debt.current_balance, debt.currency_code)}
            </p>
          </div>
          <div className="text-right">
            <p className="t-label text-xs">
              {t("debts.paid", {
                paid: formatAmount(paid, debt.currency_code),
                total: formatAmount(debt.original_amount, debt.currency_code),
              })}
            </p>
            <p className="t-label text-xs mt-0.5">
              {Math.round(progress)}%
            </p>
          </div>
        </div>

        <div
          className="h-2 rounded-full bg-surface-2 overflow-hidden"
          aria-hidden
        >
          <div
            className="h-full bg-gradient-to-r from-violet-soft to-violet-ink"
            style={{ width: `${progress}%` }}
          />
        </div>

        {(debt.minimum_payment != null || debt.payment_day != null) && (
          <div className="flex flex-wrap gap-3 pt-1 text-xs text-text-secondary">
            {debt.minimum_payment != null && (
              <span>
                {t("debts.minimumPayment", {
                  amount: formatAmount(
                    debt.minimum_payment,
                    debt.currency_code,
                  ),
                })}
              </span>
            )}
            {debt.payment_day != null && (
              <span>
                {t("debts.dueDay", { day: debt.payment_day })}
              </span>
            )}
          </div>
        )}
      </Card>

      <section className="space-y-2">
        <CardEyebrow>{t("debts.history")}</CardEyebrow>
        {payments.length === 0 ? (
          <Card variant="flat" className="text-text-secondary text-sm">
            {t("debts.noPayments")}
          </Card>
        ) : (
          <ul className="rounded-2xl bg-surface border border-border shadow-card divide-y divide-border overflow-hidden">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 px-3.5 py-3"
              >
                <span className="grid place-items-center size-9 rounded-xl bg-violet/10 text-violet">
                  <Wallet className="size-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {formatDate(p.payment_date, i18n.language)}
                  </p>
                  {p.exchange_rate != null && (
                    <p className="text-[11px] text-text-muted">
                      @ {formatRate(p.exchange_rate)} ·{" "}
                      {formatAmount(
                        p.amount_in_account_currency ?? 0,
                        "EUR",
                      )}
                    </p>
                  )}
                </div>
                <span className="font-display text-sm font-semibold tabular-nums">
                  {formatAmount(p.amount, debt.currency_code)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 pointer-events-none">
        <div className="mx-auto max-w-md px-4 pb-safe-bottom pb-4 pointer-events-auto">
          <Button
            block
            size="lg"
            onClick={() => navigate(`/debts/${debt.id}/pay`)}
            className="bg-gradient-to-br from-violet-soft via-violet to-violet-ink text-white shadow-violet-glow"
          >
            {t("debts.payCta")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ownerKey(o: string): "fran" | "sam" | "household" {
  if (o === "FRAN") return "fran";
  if (o === "SAM") return "sam";
  return "household";
}


function formatDate(iso: string, lang: string): string {
  const locale = lang?.startsWith("es") ? "es-ES" : "en-US";
  return new Date(iso).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
