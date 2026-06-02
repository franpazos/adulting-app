import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils/cn";
import { formatEUR } from "@/lib/utils/format";

interface SaveFabProps {
  amount: number;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
  /** Override label key — defaults to `addExpense.saveLabel`. */
  labelKey?: string;
}

/** Sticky violet save button sat above the bottom nav. */
export function SaveFab({
  amount,
  disabled,
  loading,
  onClick,
  labelKey = "addExpense.saveLabel",
}: SaveFabProps) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 pointer-events-none">
      <div className="mx-auto max-w-md px-4 pb-safe-bottom pb-4 pointer-events-auto">
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          className={cn(
            "w-full h-14 rounded-2xl text-white font-display font-semibold",
            "flex items-center justify-center gap-2",
            "shadow-violet-glow transition-[opacity,transform]",
            "active:scale-[0.99]",
            "bg-gradient-to-br from-violet-soft via-violet to-violet-ink",
            disabled && "opacity-60 cursor-not-allowed",
          )}
        >
          {loading
            ? t("addExpense.saving")
            : t(labelKey, { amount: formatEUR(amount) })}
        </button>
      </div>
    </div>
  );
}

