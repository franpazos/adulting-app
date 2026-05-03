import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Share, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui";
import {
  isIosSafari,
  startInstallWatcher,
  useInstallStore,
} from "@/lib/pwa/installPrompt";
import { cn } from "@/lib/utils/cn";

/**
 * Soft banner suggesting PWA install.
 *  - Chrome/Edge: triggers the native prompt via `event.prompt()`.
 *  - iOS Safari: shows instructional copy ("Share → Add to Home Screen")
 *    since iOS doesn't expose the install prompt.
 *  - Already installed (display-mode: standalone) or dismissed → hidden.
 *
 * Mounted once at the AppShell level. The first render after AppBoot starts
 * the listener; the banner appears only when the browser fires the event
 * (or on iOS Safari).
 */
export function InstallPrompt() {
  const { t } = useTranslation();
  const event = useInstallStore((s) => s.event);
  const installed = useInstallStore((s) => s.installed);
  const dismissed = useInstallStore((s) => s.dismissed);
  const dismiss = useInstallStore((s) => s.dismiss);
  const setEvent = useInstallStore((s) => s.setEvent);

  const [iosVisible, setIosVisible] = useState(false);

  useEffect(() => {
    const stop = startInstallWatcher();
    // Show iOS hint after a short delay so it doesn't compete with the splash.
    if (isIosSafari()) {
      const t = setTimeout(() => setIosVisible(true), 800);
      return () => {
        clearTimeout(t);
        stop();
      };
    }
    return stop;
  }, []);

  if (installed || dismissed) return null;

  const showNative = !!event;
  const showIos = !showNative && iosVisible && isIosSafari();
  if (!showNative && !showIos) return null;

  async function handleInstall() {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice;
    setEvent(null);
    if (choice.outcome === "dismissed") {
      // User said no — respect the choice for this session.
      dismiss();
    }
  }

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-24 z-40 px-4 pointer-events-none",
        // Bump above the bottom nav (h-16) but below sticky save FABs (z-30).
      )}
    >
      <div
        className={cn(
          "mx-auto max-w-md pointer-events-auto",
          "rounded-2xl border border-border bg-surface shadow-card-dark",
          "px-4 py-3 flex items-start gap-3",
        )}
        role="dialog"
        aria-live="polite"
      >
        <span className="grid place-items-center size-9 rounded-xl bg-violet/10 text-violet flex-shrink-0">
          <Download className="size-4.5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{t("install.title")}</p>
          <p className="text-[12px] text-text-secondary mt-0.5 leading-snug">
            {showIos ? (
              <span className="inline-flex items-center gap-1">
                {t("install.iosHint.before")}
                <Share className="size-3.5 inline" />
                {t("install.iosHint.after")}
              </span>
            ) : (
              t("install.description")
            )}
          </p>
          {showNative && (
            <Button
              size="sm"
              className="mt-2"
              onClick={handleInstall}
            >
              {t("install.cta")}
            </Button>
          )}
        </div>
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
