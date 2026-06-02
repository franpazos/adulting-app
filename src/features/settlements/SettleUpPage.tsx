/**
 * Settle up — record a settlement payment that nets out (or partially
 * reduces) an open balance between two parties. Writes a transaction of
 * type `SETTLEMENT_PAYMENT` PLUS a reverse-direction entry directly to
 * `settlement_ledger` so the net balance shifts back toward zero.
 *
 * The reverse entry's `source_transaction_id` points at the new tx so
 * `recomputeForTransaction` won't blow it away (recompute only manages
 * EXPENSE-derived ledger entries, not SETTLEMENT_PAYMENT ones).
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronLeft } from "lucide-react";

import { Avatar } from "@/components/Avatar";
import {
  Button,
  Card,
  CardEyebrow,
  IconButton,
} from "@/components/ui";
import {
  settlementsRepo,
  transactionsRepo,
  SEED_IDS,
} from "@/lib/db";
import { useDbStore } from "@/store/dbStore";
import type { OwnerType, CashSource } from "@/lib/db/types";
import {
  SOURCE_TO_ACCOUNT,
  SOURCE_TO_USER,
} from "@/features/add-expense/sources";
import { cn } from "@/lib/utils/cn";
import {
  formatEUR,
  formatAmountForInput,
  parseAmount,
} from "@/lib/utils/format";

const PARTIES: ReadonlyArray<OwnerType> = ["FRAN", "SAM", "HOUSEHOLD"];

function isParty(v: string | null): v is OwnerType {
  return v !== null && (PARTIES as ReadonlyArray<string>).includes(v);
}

function ownerToCashSource(o: OwnerType): CashSource {
  if (o === "FRAN") return "FRAN_PERSONAL";
  if (o === "SAM") return "SAM_PERSONAL";
  return "JOINT";
}

export function SettleUpPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const dbReady = useDbStore((s) => s.status === "ready");
  const bumpVersion = useDbStore((s) => s.bumpVersion);

  const fromParam = params.get("from");
  const toParam = params.get("to");
  const from: OwnerType = isParty(fromParam) ? fromParam : "FRAN";
  const to: OwnerType = isParty(toParam) ? toParam : "SAM";

  const currentNet = useMemo(
    () => (dbReady ? settlementsRepo.netBalance(from, to) : 0),
    [dbReady, from, to],
  );
  // Outstanding balance from→to. If currentNet is negative, the params are
  // backwards — the page expects from-owes-to context.
  const outstanding = Math.max(0, currentNet);

  const [amount, setAmount] = useState(outstanding);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setAmount(outstanding);
  }, [outstanding]);

  function handleSave() {
    if (!dbReady || amount <= 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Cash actually flows from `from` to `to`. So source = from's account,
      // owner = `to` (the creditor). When `to` is HOUSEHOLD, the joint
      // account's balance grows back; when `to` is a person, that person
      // receives. We model this as a SETTLEMENT_PAYMENT tx with a single
      // allocation to the `to` party (who economically benefits).
      const sourceCash = ownerToCashSource(from);
      const tx = transactionsRepo.create({
        type: "SETTLEMENT_PAYMENT",
        date,
        amount,
        currency_code: "EUR",
        source_account_id: SOURCE_TO_ACCOUNT[sourceCash],
        description: t("settleUp.txDescription", {
          from: nameOf(from, t),
          to: nameOf(to, t),
        }),
        category_id: null,
        created_by_user_id: SOURCE_TO_USER[sourceCash],
        origin: "MANUAL",
        sheet_sync_status: "PENDING",
        allocations: [
          { owner_type: to, share_percent: 100, share_amount: amount },
        ],
      });

      // Reverse-direction ledger entry: `to` "owes" `from` the amount,
      // canceling the original `from owes to` balance. (recomputeForTransaction
      // only affects EXPENSE rows, so this stays intact.)
      settlementsRepo.create({
        date,
        source_transaction_id: tx.id,
        from_party: to,
        to_party: from,
        amount,
        reason: "settlement_payment",
        notes: null,
      });

      bumpVersion();
      navigate("/settlements");
    } catch (err) {
      console.error("[settle-up] save failed", err);
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  // Suppress unused warning when SEED_IDS gets pruned
  void SEED_IDS;

  return (
    <div className="mx-auto max-w-md px-4 pb-32">
      <div className="flex items-center justify-between pt-4 pb-2">
        <IconButton
          aria-label={t("settlements.back")}
          onClick={() => navigate(-1)}
        >
          <ChevronLeft className="size-5" />
        </IconButton>
        <h1 className="font-display text-base font-semibold">
          {t("settleUp.title")}
        </h1>
        <span className="size-10" aria-hidden />
      </div>

      <Card className="space-y-4">
        <div className="flex items-center justify-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <Avatar who={from} size={42} />
            <span className="text-[11px] font-semibold">
              {nameOf(from, t)}
            </span>
          </div>
          <ArrowRight className="size-5 text-violet" />
          <div className="flex flex-col items-center gap-1">
            <Avatar who={to} size={42} />
            <span className="text-[11px] font-semibold">{nameOf(to, t)}</span>
          </div>
        </div>

        <div className="text-center">
          <p className="t-eyebrow">{t("settleUp.outstanding")}</p>
          <p className="t-amount-lg mt-1 text-violet-ink dark:text-violet-soft">
            {formatEUR(outstanding)}
          </p>
        </div>
      </Card>

      <section className="mt-5 space-y-2">
        <CardEyebrow>{t("settleUp.amount")}</CardEyebrow>
        <Card variant="flat" className="flex items-baseline gap-1.5 px-4 py-3">
          <span className="font-display text-2xl font-medium text-text-muted">
            €
          </span>
          <input
            inputMode="decimal"
            type="text"
            value={formatAmountForInput(amount)}
            onChange={(e) => setAmount(parseAmount(e.target.value))}
            className={cn(
              "bg-transparent border-0 outline-none flex-1",
              "font-display text-2xl font-semibold tabular-nums",
              "text-text-primary",
            )}
          />
        </Card>
        {amount < outstanding && amount > 0 && (
          <p className="t-label text-xs">
            {t("settleUp.partial", {
              remaining: formatEUR(outstanding - amount),
            })}
          </p>
        )}
      </section>

      <section className="mt-5 space-y-2">
        <CardEyebrow>{t("addExpense.date")}</CardEyebrow>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 w-full rounded-2xl border border-border bg-surface px-4 text-base outline-none focus:border-violet"
        />
      </section>

      {saveError && (
        <p className="mt-3 text-sm text-expense-ink" role="alert">
          {saveError}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 pointer-events-none">
        <div className="mx-auto max-w-md px-4 pb-safe-bottom pb-4 pointer-events-auto">
          <Button
            block
            size="lg"
            disabled={amount <= 0 || saving}
            onClick={handleSave}
            className="bg-gradient-to-br from-violet-soft via-violet to-violet-ink text-white shadow-violet-glow"
          >
            {saving
              ? t("addExpense.saving")
              : t("settleUp.saveLabel", { amount: formatEUR(amount) })}
          </Button>
        </div>
      </div>
    </div>
  );
}

function nameOf(o: OwnerType, t: (k: string) => string): string {
  if (o === "FRAN") return t("addExpense.who.fran");
  if (o === "SAM") return t("addExpense.who.sam");
  return t("addExpense.who.household");
}

