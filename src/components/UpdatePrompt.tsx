import { useTranslation } from "react-i18next";
import { RefreshCw, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui";
import { useNetworkStore } from "@/store/networkStore";
import { cn } from "@/lib/utils/cn";

/**
 * "New version available" banner. Triggered when the SW reports a waiting
 * worker; tapping Refresh applies the update and reloads. Dismiss keeps
 * the current version active until the next reload.
 */
export function UpdatePrompt() {
  const { t } = useTranslation();
  const need = useNetworkStore((s) => s.needRefresh);
  const apply = useNetworkStore((s) => s.applyUpdate);
  const dismiss = useNetworkStore((s) => s.dismissUpdate);

  if (!need) return null;

  return (
    <div className="fixed inset-x-0 top-3 z-50 px-4 pointer-events-none pt-safe-top">
      <div
        className={cn(
          "mx-auto max-w-md pointer-events-auto",
          "rounded-2xl border border-violet/30 bg-violet/10",
          "px-4 py-3 flex items-center gap-3 shadow-card",
        )}
        role="status"
        aria-live="polite"
      >
        <span className="grid place-items-center size-9 rounded-xl bg-violet text-white flex-shrink-0">
          <RefreshCw className="size-4.5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{t("update.title")}</p>
          <p className="text-[12px] text-text-secondary mt-0.5">
            {t("update.description")}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => apply?.()}
        >
          {t("update.cta")}
        </Button>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t("install.dismiss")}
          onClick={dismiss}
        >
          <X className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}
