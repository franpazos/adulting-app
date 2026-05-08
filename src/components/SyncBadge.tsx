import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, CloudAlert, RefreshCw } from "lucide-react";
import { useSyncStore } from "@/store/syncStore";
import { cn } from "@/lib/utils/cn";

/**
 * Compact sync status pill for the AppHeader. Shows:
 *   - "Syncing…" with spinner while a pull/push is in flight.
 *   - A 2s "Synced" confirmation right after a successful run.
 *   - "Sync error" pill (clickable → /settings) when the last run failed.
 *   - Nothing while idle (steady state).
 */
export function SyncBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  const phase = useSyncStore((s) => s.phase);
  const sheet = useSyncStore((s) => s.sheet);

  const [showSuccess, setShowSuccess] = useState(false);
  useEffect(() => {
    if (phase !== "success") return;
    setShowSuccess(true);
    const timer = setTimeout(() => setShowSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [phase]);

  if (!sheet) return null;

  if (phase === "pulling" || phase === "pushing") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
          "bg-violet/10 text-violet text-[11px] font-medium",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <RefreshCw className="size-3.5 animate-spin" strokeWidth={2.4} />
        {t("sync.badge.syncing")}
      </span>
    );
  }

  if (phase === "error") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
          "bg-expense/10 text-expense text-[11px] font-medium",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <CloudAlert className="size-3.5" strokeWidth={2.4} />
        {t("sync.badge.error")}
      </span>
    );
  }

  if (showSuccess) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
          "bg-positive/10 text-positive text-[11px] font-medium",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <CheckCircle2 className="size-3.5" strokeWidth={2.4} />
        {t("sync.badge.synced")}
      </span>
    );
  }

  return null;
}
