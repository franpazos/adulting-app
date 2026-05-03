import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  formatMonthLabel,
  shiftMonthKey,
  type MonthKey,
} from "@/lib/date/month";
import { Sheet, IconButton } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

interface MonthSelectorProps {
  value: MonthKey;
  onChange: (next: MonthKey) => void;
  className?: string;
}

export function MonthSelector({
  value,
  onChange,
  className,
}: MonthSelectorProps) {
  const { i18n } = useTranslation();
  const lang = (i18n.language?.startsWith("es") ? "es" : "en") as "es" | "en";
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 -ml-1 px-1 py-1 rounded-lg",
          "text-text-secondary hover:text-text-primary",
          "transition-colors active:scale-[0.98]",
          className,
        )}
        aria-haspopup="dialog"
      >
        <span className="font-display text-sm font-medium">
          {formatMonthLabel(value, lang)}
        </span>
        <ChevronDown className="size-4" />
      </button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={formatMonthLabel(value, lang)}
        description={undefined}
      >
        <div className="flex items-center justify-between py-2">
          <IconButton
            aria-label="Previous month"
            onClick={() => onChange(shiftMonthKey(value, -1))}
          >
            <ChevronLeft className="size-5" />
          </IconButton>
          <span className="font-display text-lg font-semibold">
            {formatMonthLabel(value, lang)}
          </span>
          <IconButton
            aria-label="Next month"
            onClick={() => onChange(shiftMonthKey(value, 1))}
          >
            <ChevronRight className="size-5" />
          </IconButton>
        </div>
      </Sheet>
    </>
  );
}
