import { Trans, useTranslation } from "react-i18next";
import type { CashSource, OwnerType } from "@/lib/db/types";
import type { AllocatorSettlement } from "@/lib/calculations";
import { whoFromCashSource } from "@/components/Avatar";

interface ConsequenceSentenceProps {
  amount: number;
  source: CashSource;
  owner: OwnerType;
  settlement: AllocatorSettlement | null;
}

/**
 * Plain-English sentence that mirrors the chip — used in card surfaces
 * (e.g. "What happens" panel). The chip is icon-driven; this is the
 * accessible read-aloud version.
 */
export function ConsequenceSentence({
  amount,
  source,
  owner,
  settlement,
}: ConsequenceSentenceProps) {
  const { t } = useTranslation();

  if (amount <= 0) {
    return (
      <span className="text-text-muted">
        {t("addExpense.live.placeholder")}
      </span>
    );
  }

  const paidBy = whoLabel(whoFromCashSource(source), t);
  const belongsTo = whoLabel(owner, t);

  if (!settlement) {
    return (
      <Trans
        i18nKey="addExpense.live.sentenceNoImpact"
        values={{ paidBy, belongsTo }}
        components={{
          b: <b className="text-text-primary" />,
          ok: <span className="text-positive font-medium" />,
        }}
      />
    );
  }

  return (
    <Trans
      i18nKey="addExpense.live.sentenceImpact"
      values={{
        paidBy,
        belongsTo,
        from: whoLabel(settlement.from, t),
        to: whoLabel(settlement.to, t),
        amount: formatEUR(settlement.amount),
      }}
      components={{
        b: <b className="text-text-primary" />,
        v: <b className="text-violet" />,
      }}
    />
  );
}

function whoLabel(
  who: "FRAN" | "SAM" | "HOUSEHOLD" | "JOINT",
  t: (k: string) => string,
): string {
  if (who === "FRAN") return t("addExpense.who.fran");
  if (who === "SAM") return t("addExpense.who.sam");
  if (who === "HOUSEHOLD") return t("addExpense.who.household");
  return t("addExpense.who.joint");
}

function formatEUR(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}
