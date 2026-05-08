import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LogoMark } from "@/components/Logo";
import { IconButton, Badge } from "@/components/ui";
import { MonthSelector } from "@/components/MonthSelector";
import { NetworkBadge } from "@/components/NetworkBadge";
import { SyncBadge } from "@/components/SyncBadge";
import { useUiStore } from "@/store/uiStore";
import { cn } from "@/lib/utils/cn";

interface AppHeaderProps {
  /** Show month selector under the brand row. Default true on Home; false on detail screens. */
  showMonth?: boolean;
  /** Optional right-side slot (defaults to notifications bell). */
  right?: React.ReactNode;
  className?: string;
}

export function AppHeader({
  showMonth = true,
  right,
  className,
}: AppHeaderProps) {
  const { t } = useTranslation();
  const monthKey = useUiStore((s) => s.monthKey);
  const setMonthKey = useUiStore((s) => s.setMonthKey);

  return (
    <header className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LogoMark className="size-7" />
          <span className="font-display text-lg font-semibold tracking-tight">
            {t("app.name")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge />
          <NetworkBadge />
          {right ?? (
            <IconButton aria-label="Notifications">
              <Bell className="size-5" />
              <Badge dot className="absolute top-2 right-2.5" />
            </IconButton>
          )}
        </div>
      </div>
      {showMonth && (
        <MonthSelector value={monthKey} onChange={setMonthKey} />
      )}
    </header>
  );
}
