import { Check, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/Avatar";
import type { AllocatorSettlement } from "@/lib/calculations";
import { cn } from "@/lib/utils/cn";

interface SettlementChipProps {
  /** Computed settlement, or null when there is no impact. */
  settlement: AllocatorSettlement | null;
  className?: string;
}

/**
 * Live consequence pill shown below the FlowDiagram on Add Expense.
 *  - No settlement → soft green pill with a check.
 *  - Settlement   → violet pill with two avatars and the amount.
 */
export function SettlementChip({
  settlement,
  className,
}: SettlementChipProps) {
  const { t } = useTranslation();

  // `key` forces a remount when the chip content meaningfully changes so
  // the `pop-in` animation runs each time the consequence shifts (e.g.
  // toggling source from Joint to Personal).
  const popKey = settlement
    ? `s:${settlement.from}>${settlement.to}:${settlement.amount}`
    : "no-impact";

  if (!settlement) {
    return (
      <div
        key={popKey}
        className={cn(
          "pop-in",
          "inline-flex items-center justify-center gap-2",
          "px-3.5 py-2 rounded-full",
          "bg-positive/10 text-positive-ink",
          "text-sm font-medium",
          className,
        )}
      >
        <Check className="size-3.5" strokeWidth={2.6} />
        {t("addExpense.live.noImpact")}
      </div>
    );
  }

  return (
    <div
      key={popKey}
      className={cn(
        "pop-in",
        "inline-flex items-center justify-center gap-2",
        "px-3.5 py-2 rounded-full",
        "bg-violet/10 text-violet-ink dark:text-violet-soft",
        "text-sm font-semibold",
        className,
      )}
    >
      <Avatar who={settlement.from} size={20} />
      <span>{whoName(settlement.from, t)}</span>
      <ArrowRight className="size-3.5" strokeWidth={2.4} />
      <span>{whoName(settlement.to, t)}</span>
      <span className="ml-1 font-display font-semibold tabular-nums">
        {formatEUR(settlement.amount)}
      </span>
    </div>
  );
}

function whoName(
  who: "FRAN" | "SAM" | "HOUSEHOLD",
  t: (k: string) => string,
): string {
  if (who === "FRAN") return t("addExpense.who.fran");
  if (who === "SAM") return t("addExpense.who.sam");
  return t("addExpense.who.household");
}

function formatEUR(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}
