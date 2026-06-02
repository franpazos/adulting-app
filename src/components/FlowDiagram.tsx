import { useTranslation } from "react-i18next";
import { Avatar, whoFromCashSource, type AvatarWho } from "@/components/Avatar";
import type { CashSource, OwnerType } from "@/lib/db/types";
import { cn } from "@/lib/utils/cn";

interface FlowDiagramProps {
  source: CashSource;
  owner: OwnerType;
  className?: string;
}

/**
 * Source avatar → dashed violet arrow → owner avatar. The signature
 * visual of the Add Expense screen (Variation B from the design handoff).
 */
export function FlowDiagram({ source, owner, className }: FlowDiagramProps) {
  const { t } = useTranslation();
  const sourceWho = whoFromCashSource(source);
  const ownerWho: AvatarWho = owner;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 py-2",
        className,
      )}
    >
      <FlowEnd who={sourceWho} label={whoLabel(sourceWho, t)} />
      <div className="flex-1 flex flex-col items-center gap-1 max-w-[120px]">
        <svg
          viewBox="0 0 100 22"
          preserveAspectRatio="none"
          className="w-full h-[22px]"
          aria-hidden
        >
          <line
            x1="2" y1="11" x2="92" y2="11"
            className="stroke-violet"
            strokeWidth="2"
            strokeDasharray="3 3"
            opacity="0.55"
          />
          <polygon points="92,11 86,7 86,15" className="fill-violet" />
        </svg>
      </div>
      <FlowEnd who={ownerWho} label={whoLabel(ownerWho, t)} />
    </div>
  );
}

function FlowEnd({ who, label }: { who: AvatarWho; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-[60px]">
      <Avatar who={who} size={36} />
      <span className="text-xs font-semibold text-text-primary">{label}</span>
    </div>
  );
}

function whoLabel(who: AvatarWho, t: (k: string) => string): string {
  if (who === "FRAN") return t("addExpense.who.fran");
  if (who === "SAM") return t("addExpense.who.sam");
  if (who === "HOUSEHOLD") return t("addExpense.who.household");
  return t("addExpense.who.joint");
}
