import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  ChevronRight,
  CloudOff,
  KeyRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { LogoMark } from "@/components/Logo";
import { IconButton, Badge, Sheet } from "@/components/ui";
import { MonthSelector } from "@/components/MonthSelector";
import { NetworkBadge } from "@/components/NetworkBadge";
import { SyncBadge } from "@/components/SyncBadge";
import { useUiStore } from "@/store/uiStore";
import { useDbStore } from "@/store/dbStore";
import { useSyncStore } from "@/store/syncStore";
import { useAuthStore, hasValidToken } from "@/store/authStore";
import { unresolvedConflictCount } from "@/lib/sync/conflicts";
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
          {right ?? <NotificationsBell />}
        </div>
      </div>
      {showMonth && (
        <MonthSelector value={monthKey} onChange={setMonthKey} />
      )}
    </header>
  );
}

/**
 * Bell icon that opens a notifications sheet listing actionable items
 * (currently: unresolved sync conflicts). Red dot appears only when
 * there's something to surface — no permanent decoration.
 */
function NotificationsBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dbReady = useDbStore((s) => s.status === "ready");
  const dbVersion = useDbStore((s) => s.dbVersion);

  // Sync error state — phase === "error" + lastError set means the most
  // recent sync attempt failed. A subsequent successful sync flips phase
  // to "success" and the bell drops it automatically.
  const syncPhase = useSyncStore((s) => s.phase);
  const syncError = useSyncStore((s) => s.lastError);
  const hasSyncError = syncPhase === "error" && Boolean(syncError);

  // Auth expired — only flag when a sheet is bound (i.e. user was actively
  // syncing) and the token is no longer valid. Otherwise silent — first-time
  // users haven't authed yet and don't need a notification about it.
  const authToken = useAuthStore((s) => s.token);
  const sheet = useSyncStore((s) => s.sheet);
  const authExpired = Boolean(sheet) && !hasValidToken(authToken);

  const [conflicts, setConflicts] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!dbReady) return;
    setConflicts(unresolvedConflictCount());
  }, [dbReady, dbVersion, open]);

  const total =
    conflicts + (hasSyncError ? 1 : 0) + (authExpired ? 1 : 0);
  const hasNotifications = total > 0;

  return (
    <>
      <IconButton
        aria-label={t("notifications.aria", { count: total })}
        onClick={() => setOpen(true)}
      >
        <Bell className="size-5" />
        {hasNotifications && (
          <Badge dot className="absolute top-2 right-2.5" />
        )}
      </IconButton>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t("notifications.title")}
      >
        {hasNotifications ? (
          <ul className="space-y-2">
            {authExpired && (
              <li>
                <NotificationCard
                  tone="warning"
                  icon={<KeyRound className="size-4.5" />}
                  title={t("notifications.authExpired.title")}
                  detail={t("notifications.authExpired.cta")}
                  onClick={() => {
                    setOpen(false);
                    navigate("/settings");
                  }}
                />
              </li>
            )}
            {hasSyncError && (
              <li>
                <NotificationCard
                  tone="expense"
                  icon={<CloudOff className="size-4.5" />}
                  title={t("notifications.syncError.title")}
                  detail={syncError ?? t("notifications.syncError.fallback")}
                  onClick={() => {
                    setOpen(false);
                    navigate("/settings");
                  }}
                />
              </li>
            )}
            {conflicts > 0 && (
              <li>
                <NotificationCard
                  tone="warning"
                  icon={<AlertTriangle className="size-4.5" />}
                  title={t("notifications.conflicts.title", {
                    count: conflicts,
                  })}
                  detail={t("notifications.conflicts.cta")}
                  onClick={() => {
                    setOpen(false);
                    navigate("/sync/conflicts");
                  }}
                />
              </li>
            )}
          </ul>
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-text-primary">
              {t("notifications.empty.title")}
            </p>
            <p className="t-label text-xs mt-1">
              {t("notifications.empty.description")}
            </p>
          </div>
        )}
      </Sheet>
    </>
  );
}

interface NotificationCardProps {
  tone: "warning" | "expense";
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}

function NotificationCard({
  tone,
  icon,
  title,
  detail,
  onClick,
}: NotificationCardProps) {
  const toneStyles =
    tone === "warning"
      ? {
          card: "border-warning/40 bg-warning/10 hover:bg-warning/15 focus-visible:ring-warning/60",
          iconBg: "bg-warning/20 text-warning-ink",
          title: "text-warning-ink",
        }
      : {
          card: "border-expense/40 bg-expense/10 hover:bg-expense/15 focus-visible:ring-expense/60",
          iconBg: "bg-expense/20 text-expense-ink",
          title: "text-expense-ink",
        };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 text-left",
        "rounded-2xl border px-4 py-3",
        "active:scale-[0.99] transition-[transform,background-color]",
        "focus-visible:outline-none focus-visible:ring-2",
        toneStyles.card,
      )}
    >
      <span
        className={cn(
          "grid place-items-center size-9 rounded-xl shrink-0",
          toneStyles.iconBg,
        )}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold", toneStyles.title)}>{title}</p>
        <p className="t-label text-xs line-clamp-2">{detail}</p>
      </div>
      <ChevronRight className="size-4 text-text-muted shrink-0" />
    </button>
  );
}
