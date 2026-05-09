import { useNavigate } from "react-router-dom";
import { Avatar, whoFromCashSource } from "@/components/Avatar";
import { Pill } from "@/components/ui";
import type { Transaction } from "@/lib/db/types";
import { categoriesRepo } from "@/lib/db";
import { accountIdToCashSource } from "@/features/add-expense/sources";
import { cn } from "@/lib/utils/cn";

interface TransactionRowProps {
  tx: Transaction;
  /** True when the tx has multiple allocations → mark as Shared. */
  shared?: boolean;
  onClick?: () => void;
  className?: string;
}

export function TransactionRow({
  tx,
  shared,
  onClick,
  className,
}: TransactionRowProps) {
  const navigate = useNavigate();
  const handleClick =
    onClick ?? (() => navigate(`/transactions/${tx.id}`));

  const source = accountIdToCashSource(tx.source_account_id);
  const who = whoFromCashSource(source);
  const cat = tx.category_id ? categoriesRepo.getById(tx.category_id) : null;
  const isExpense = tx.type === "EXPENSE";
  const sign = isExpense ? -1 : 1;
  const tone = isExpense ? "text-text-primary" : "text-positive-ink";

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl",
        "bg-surface border border-border shadow-card",
        "active:scale-[0.99] transition-transform text-left",
        className,
      )}
    >
      <Avatar who={who} size={36} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">
          {tx.description || tx.merchant || cat?.name || "—"}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {cat && (
            <span className="flex items-center gap-1.5 text-xs text-text-secondary">
              {cat.color && (
                <span
                  className="size-2 rounded-full"
                  style={{ background: cat.color }}
                />
              )}
              {cat.name}
            </span>
          )}
          {shared && (
            <Pill tone="violet" className="h-5 px-2 text-[10px]">
              Shared
            </Pill>
          )}
          {tx.type === "DEBT_PAYMENT" && (
            <Pill tone="info" className="h-5 px-2 text-[10px]">
              Debt
            </Pill>
          )}
        </div>
      </div>
      <span
        className={cn(
          "font-display text-base font-semibold tabular-nums",
          tone,
        )}
      >
        {formatSigned(sign * tx.amount, tx.currency_code)}
      </span>
    </button>
  );
}

function formatSigned(n: number, currency: string): string {
  const formatted = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    signDisplay: "auto",
  }).format(n);
  return formatted;
}
