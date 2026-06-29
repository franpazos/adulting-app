/**
 * Calibrate-account sheet. Lets the user override the running balance
 * to match what the bank actually shows. Writes an `account_adjustments`
 * row carrying the signed delta — never mutates the account row itself.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal } from "lucide-react";

import {
  Button,
  Input,
  Sheet,
} from "@/components/ui";
import { accountAdjustmentsRepo } from "@/lib/db";
import type { Account } from "@/lib/db/types";
import {
  formatAmountForInput,
  formatMoney,
  parseAmount,
  sanitizeAmountInput,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

interface AccountAdjustSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account;
  /** The currently-computed balance the calibration will be measured against. */
  currentBalance: number;
  onSaved?: () => void;
}

export function AccountAdjustSheet({
  open,
  onOpenChange,
  account,
  currentBalance,
  onSaved,
}: AccountAdjustSheetProps) {
  const { t } = useTranslation();
  const [targetText, setTargetText] = useState("");
  const [notes, setNotes] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset to the current balance every time the sheet opens — the user
  // sees the starting state and adjusts from there.
  useEffect(() => {
    if (open) {
      setTargetText(formatAmountForInput(currentBalance));
      setNotes("");
      setSaveError(null);
    }
  }, [open, currentBalance]);

  const target = parseAmount(targetText);
  const delta = useMemo(
    () => round2(target - currentBalance),
    [target, currentBalance],
  );
  const noChange = Math.abs(delta) < 0.005;
  const positive = delta > 0;

  function handleSave() {
    if (noChange) return;
    setSaveError(null);
    try {
      accountAdjustmentsRepo.create({
        account_id: account.id,
        date: new Date().toISOString().slice(0, 10),
        target_balance: target,
        delta,
        notes: notes.trim() || null,
      });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  const previewKey = noChange
    ? "accounts.adjust.previewNoChange"
    : positive
      ? "accounts.adjust.previewPositive"
      : "accounts.adjust.previewNegative";

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("accounts.adjust.title")}
      description={t("accounts.adjust.description")}
    >
      <div className="space-y-4">
        {/* Current → target reading */}
        <div className="rounded-2xl border border-border bg-bg p-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="t-label">{t("accounts.adjust.currentLabel")}</span>
            <span className="font-display font-semibold tabular-nums">
              {formatMoney(currentBalance, account.currency_code)}
            </span>
          </div>
        </div>

        {/* Target input */}
        <div className="space-y-1.5">
          <label
            htmlFor="adjust-target"
            className="t-label text-[11px] uppercase tracking-wide"
          >
            {t("accounts.adjust.targetLabel")}
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="adjust-target"
              inputMode="decimal"
              value={targetText}
              onChange={(e) =>
                setTargetText(sanitizeAmountInput(e.target.value))
              }
              placeholder="0,00"
              className="text-right tabular-nums"
            />
            <span className="font-display text-sm text-text-secondary">
              {account.currency_code}
            </span>
          </div>
        </div>

        {/* Live delta preview */}
        <div
          className={cn(
            "rounded-2xl border p-3 flex items-center gap-3",
            noChange && "border-border bg-surface",
            !noChange &&
              positive &&
              "border-positive/30 bg-positive/10",
            !noChange &&
              !positive &&
              "border-expense/30 bg-expense/10",
          )}
        >
          <div
            className={cn(
              "size-9 rounded-full grid place-items-center shrink-0",
              noChange && "bg-surface text-text-secondary",
              !noChange && positive && "bg-positive/20 text-positive-ink",
              !noChange && !positive && "bg-expense/20 text-expense-ink",
            )}
            aria-hidden
          >
            <SlidersHorizontal className="size-4" />
          </div>
          <p className="text-sm">
            {t(previewKey, {
              delta: formatMoney(Math.abs(delta), account.currency_code),
            })}
          </p>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label
            htmlFor="adjust-notes"
            className="t-label text-[11px] uppercase tracking-wide"
          >
            {t("accounts.adjust.notesLabel")}
          </label>
          <textarea
            id="adjust-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("accounts.adjust.notesPlaceholder")}
            rows={3}
            maxLength={500}
            className={cn(
              "w-full rounded-xl border border-border bg-surface text-text-primary",
              "px-3 py-2 text-base leading-relaxed resize-none",
              "focus:outline-none focus:border-violet focus:ring-2 focus:ring-violet/30",
            )}
          />
        </div>

        {saveError && (
          <p className="text-xs text-expense-ink" role="alert">
            {saveError}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            block
            size="md"
            onClick={handleSave}
            disabled={noChange}
            className={noChange ? "opacity-60" : ""}
          >
            {t("accounts.adjust.saveCta")}
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
