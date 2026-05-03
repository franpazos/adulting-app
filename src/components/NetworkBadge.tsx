import { CloudOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNetworkStore } from "@/store/networkStore";
import { cn } from "@/lib/utils/cn";

/**
 * Subtle offline indicator. Hidden when online to avoid noise.
 * Renders inline; place it wherever it should appear (header is recommended).
 */
export function NetworkBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  const online = useNetworkStore((s) => s.online);
  if (online) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
        "bg-warning/10 text-warning text-[11px] font-medium",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <CloudOff className="size-3.5" strokeWidth={2.4} />
      {t("network.offline")}
    </span>
  );
}
