/**
 * Recurring detail — read-only summary, "Register this month's payment" CTA,
 * archive/reactivate actions. Mirrors the shape of DebtDetailPage so the
 * navigation model stays consistent across recurring/debts.
 *
 * The CTA navigates to /add?fromRecurring=<id>, which prefills the expense
 * form from the recurring's defaults. For DEBT_PAYMENT recurrings the CTA is
 * replaced by a hint pointing to /debts, because /add is for EXPENSE only
 * and we don't have a recurring→debt link yet (Level 3 territory).
 */

import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  Pencil,
  Archive,
  RotateCcw,
  ArrowRight,
  Check,
  Clock,
} from "lucide-react";

import { Avatar } from "@/components/Avatar";
import {
  Button,
  Card,
  CardEyebrow,
  IconButton,
  Pill,
} from "@/components/ui";
import { categoriesRepo, recurringRepo } from "@/lib/db";
import { useDbStore } from "@/store/dbStore";
import { formatEUR } from "@/lib/utils/format";
import { accountIdToCashSource } from "@/features/add-expense/sources";
import { currentMonthKey } from "@/lib/date/month";

export function RecurringDetailPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const dbReady = useDbStore((s) => s.status === "ready");
  const dbVersion = useDbStore((s) => s.dbVersion);
  const bumpVersion = useDbStore((s) => s.bumpVersion);

  const monthKey = currentMonthKey();

  const item = useMemo(
    () => (dbReady && id ? recurringRepo.getById(id) : null),
    [dbReady, dbVersion, id],
  );
  const category = useMemo(
    () =>
      dbReady && item?.category_id
        ? categoriesRepo.getById(item.category_id)
        : null,
    [dbReady, dbVersion, item?.category_id],
  );
  const monthState = useMemo(() => {
    if (!dbReady || !id) return null;
    return recurringRepo.paidStateForMonth(monthKey).get(id) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbReady, dbVersion, id, monthKey]);

  function handleArchive() {
    if (!id) return;
    if (!window.confirm(t("recurring.confirmDeactivate"))) return;
    recurringRepo.deactivate(id);
    bumpVersion();
    navigate("/recurring");
  }

  function handleReactivate() {
    if (!id) return;
    recurringRepo.reactivate(id);
    bumpVersion();
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-md px-4 pt-8">
        <p className="t-label">{t("recurring.notFound")}</p>
        <Button
          variant="ghost"
          className="mt-3"
          onClick={() => navigate("/recurring")}
        >
          {t("recurring.backToList")}
        </Button>
      </div>
    );
  }

  const isDebt = item.type === "DEBT_PAYMENT";
  const isIncome = item.type === "INCOME";
  const source = item.source_account_id
    ? accountIdToCashSource(item.source_account_id)
    : null;
  // After Level 4 + the income polymorphism (0.5.1), all three types
  // can be quick-filled. DEBT_PAYMENT with a linked debt routes through
  // /debts/:id/pay (so the payment hits the principal). EXPENSE and
  // INCOME route to /add?fromRecurring=<id> where the form auto-detects
  // the type from the recurring. Unlinked DEBT_PAYMENT recurrings get a
  // "Sin enlace a deuda" hint instead of the CTA.
  const canQuickFillExpense = item.type === "EXPENSE" && item.is_active;
  const canQuickFillIncome = isIncome && item.is_active;
  const canQuickFillDebt =
    isDebt && item.is_active && item.debt_id !== null;
  const canQuickFill =
    canQuickFillExpense || canQuickFillIncome || canQuickFillDebt;
  // Paid/pending now applies to all three types (Level 4 added INCOME
  // and DEBT_PAYMENT auto-gen).
  const showPaidState = item.is_active;
  const isPaid = (monthState?.count ?? 0) > 0;

  return (
    <div className="mx-auto max-w-md px-4 pb-32 space-y-5">
      <div className="flex items-center justify-between pt-4 pb-2">
        <IconButton
          aria-label={t("settlements.back")}
          onClick={() => navigate("/recurring")}
        >
          <ChevronLeft className="size-5" />
        </IconButton>
        <h1 className="font-display text-base font-semibold">
          {t("recurring.detailTitle")}
        </h1>
        <IconButton
          aria-label={t("recurring.editAria")}
          onClick={() => navigate(`/recurring/${item.id}/edit`)}
        >
          <Pencil className="size-5" />
        </IconButton>
      </div>

      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <Avatar who={item.owner_type} size={42} />
          <div className="flex-1 min-w-0">
            <p className="font-display text-lg font-semibold truncate">
              {item.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Pill tone="neutral" className="h-5 px-2 text-[10px]">
                {t(`recurring.types.${typeKey(item.type)}`)}
              </Pill>
              <Pill tone="neutral" className="h-5 px-2 text-[10px]">
                {t("recurring.monthly")}
              </Pill>
              {!item.is_active && (
                <Pill tone="positive" className="h-5 px-2 text-[10px]">
                  {t("recurring.archivedBadge")}
                </Pill>
              )}
            </div>
          </div>
        </div>

        {showPaidState && (
          <div
            className={`flex items-center gap-2 rounded-xl px-3 py-2 ${
              isPaid
                ? "bg-positive/10 text-positive-ink"
                : "bg-surface-2 text-text-secondary"
            }`}
          >
            <span
              className={`grid place-items-center size-7 rounded-lg ${
                isPaid ? "bg-positive/20" : "bg-surface"
              }`}
              aria-hidden
            >
              {isPaid ? (
                <Check className="size-4" strokeWidth={3} />
              ) : (
                <Clock className="size-4" />
              )}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {isPaid
                  ? t("recurring.paidThisMonth")
                  : t("recurring.pendingThisMonth")}
              </p>
              {isPaid && monthState?.lastDate && (
                <p className="text-[11px] text-text-secondary mt-0.5">
                  {t("recurring.lastPaidOn", {
                    date: formatDate(monthState.lastDate, i18n.language),
                  })}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="pt-2">
          <p className="t-eyebrow">
            {isIncome
              ? t("recurring.monthlyIn")
              : t("recurring.monthlyExpected")}
          </p>
          <p
            className={`t-amount-lg mt-1 ${
              isIncome ? "text-positive-ink" : "text-text-primary"
            }`}
          >
            {isIncome ? "+" : ""}
            {formatEUR(item.amount)}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 pt-1 text-xs text-text-secondary">
          {source && (
            <span>
              {t("recurring.fields.paidFrom")}:{" "}
              {t(`addExpense.who.${sourceKey(source)}`)}
            </span>
          )}
          <span>
            {t("recurring.fields.owner")}:{" "}
            {t(`addExpense.who.${ownerKey(item.owner_type)}`)}
          </span>
          {category && (
            <span>
              {t("recurring.fields.category")}: {category.name}
            </span>
          )}
        </div>
      </Card>

      {isDebt && !item.debt_id && (
        <Card
          variant="flat"
          className="flex items-center justify-between gap-3"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {t("recurring.debtUnlinked.title")}
            </p>
            <p className="t-label text-xs mt-0.5">
              {t("recurring.debtUnlinked.body")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/recurring/${item.id}/edit`)}
            className="shrink-0"
          >
            {t("recurring.debtUnlinked.cta")}
            <ArrowRight className="size-4" />
          </Button>
        </Card>
      )}

      <section className="space-y-2 pt-1">
        <CardEyebrow>{t("recurring.actions")}</CardEyebrow>
        <Card variant="flat" className="divide-y divide-border/60 p-0">
          {item.is_active ? (
            <ActionRow
              icon={<Archive className="size-4" />}
              label={t("recurring.archive")}
              hint={t("recurring.archiveHint")}
              onClick={handleArchive}
            />
          ) : (
            <ActionRow
              icon={<RotateCcw className="size-4" />}
              label={t("recurring.reactivate")}
              hint={t("recurring.reactivateHint")}
              onClick={handleReactivate}
            />
          )}
        </Card>
      </section>

      {canQuickFill && (
        <div className="fixed inset-x-0 bottom-0 z-30 pointer-events-none">
          <div className="mx-auto max-w-md px-4 pb-safe-bottom pb-4 pointer-events-auto">
            <Button
              block
              size="lg"
              onClick={() =>
                navigate(
                  canQuickFillDebt
                    ? `/debts/${item.debt_id}/pay?amount=${item.amount}&fromRecurring=${item.id}`
                    : `/add?fromRecurring=${item.id}`,
                )
              }
              className="bg-gradient-to-br from-violet-soft via-violet to-violet-ink text-white shadow-violet-glow"
            >
              {isIncome
                ? t("recurring.quickFillCtaIncome")
                : t("recurring.quickFillCta")}
            </Button>
          </div>
        </div>
      )}

      {!item.is_active && (
        <div className="fixed inset-x-0 bottom-0 z-30 pointer-events-none">
          <div className="mx-auto max-w-md px-4 pb-safe-bottom pb-4 pointer-events-auto">
            <Button
              block
              size="lg"
              variant="ghost"
              onClick={handleReactivate}
              className="border border-border"
            >
              {t("recurring.reactivateCta")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionRow({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors active:bg-surface-2 text-text-primary"
    >
      <span className="grid place-items-center size-8 rounded-lg bg-surface-2">
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {hint && (
          <span className="block text-[11px] text-text-secondary mt-0.5">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}

function ownerKey(o: string): "fran" | "sam" | "household" {
  if (o === "FRAN") return "fran";
  if (o === "SAM") return "sam";
  return "household";
}

function sourceKey(s: string): "fran" | "sam" | "joint" {
  if (s === "FRAN_PERSONAL") return "fran";
  if (s === "SAM_PERSONAL") return "sam";
  return "joint";
}

function typeKey(t: string): "expense" | "income" | "debt" {
  if (t === "INCOME") return "income";
  if (t === "DEBT_PAYMENT") return "debt";
  return "expense";
}

function formatDate(iso: string, lang: string): string {
  const locale = lang?.startsWith("es") ? "es-ES" : "en-US";
  return new Date(iso + "T00:00:00").toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  });
}
