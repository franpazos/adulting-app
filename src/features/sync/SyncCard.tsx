/**
 * Settings → Google Sheets sync card.
 *
 * Three states:
 *   1. Not connected (no Google token) → "Connect with Google" button.
 *   2. Connected, no sheet bound → paste-URL input + Connect Sheet.
 *   3. Connected with sheet → status, "Sync now" button, sheet info,
 *      disconnect option.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Cloud, CloudOff, RefreshCw, Sparkles } from "lucide-react";

import { Button, Card, Input, Pill, Toggle } from "@/components/ui";
import {
  GoogleAuthError,
  isGoogleClientConfigured,
  login,
  logout,
} from "@/lib/google/auth";
import { hasValidToken, useAuthStore } from "@/store/authStore";
import { useSyncStore } from "@/store/syncStore";
import { listPending } from "@/lib/sync/queue";
import { unresolvedConflictCount } from "@/lib/sync/conflicts";
import { useDbStore } from "@/store/dbStore";
import { parseSpreadsheetId } from "@/lib/google/drive-api";
import { getSpreadsheet } from "@/lib/google/sheets-api";
import { syncAll } from "@/lib/sync/sync";
import { pullAll } from "@/lib/sync/pull";
import { ensureRawTabs } from "@/lib/sync/tabs";
import { cn } from "@/lib/utils/cn";

function sumValues(map: Record<string, number>): number {
  return Object.values(map).reduce((acc, n) => acc + n, 0);
}

export function SyncCard() {
  const { t, i18n } = useTranslation();
  const dbReady = useDbStore((s) => s.status === "ready");
  const dbVersion = useDbStore((s) => s.dbVersion);

  const authStatus = useAuthStore((s) => s.status);
  const token = useAuthStore((s) => s.token);
  const email = useAuthStore((s) => s.email);
  const authError = useAuthStore((s) => s.error);

  const sheet = useSyncStore((s) => s.sheet);
  const setSheet = useSyncStore((s) => s.setSheet);
  const manualOnly = useSyncStore((s) => s.manualOnly);
  const setManualOnly = useSyncStore((s) => s.setManualOnly);
  const monthTemplateTitle = useSyncStore((s) => s.monthTemplateTitle);
  const setMonthTemplateTitle = useSyncStore((s) => s.setMonthTemplateTitle);
  const phase = useSyncStore((s) => s.phase);
  const setPhase = useSyncStore((s) => s.setPhase);
  const lastPushAt = useSyncStore((s) => s.lastPushAt);
  const setLastPushAt = useSyncStore((s) => s.setLastPushAt);
  const lastError = useSyncStore((s) => s.lastError);
  const setError = useSyncStore((s) => s.setError);
  const bumpDbVersion = useDbStore((s) => s.bumpVersion);

  const connected = authStatus === "connected" && hasValidToken(token);
  const configured = isGoogleClientConfigured();

  // Update pending count whenever the DB version moves.
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  useEffect(() => {
    if (!dbReady) return;
    setPendingCount(listPending().length);
    setConflictCount(unresolvedConflictCount());
  }, [dbReady, dbVersion, phase]);

  if (!configured) {
    return (
      <Card variant="flat" className="space-y-2">
        <p className="text-sm font-medium">{t("sync.title")}</p>
        <p className="t-label text-xs">{t("sync.notConfigured")}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card variant="flat" className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Cloud className="size-4 text-violet" /> {t("sync.title")}
          </span>
          <Pill tone={connected ? "positive" : "neutral"}>
            {connected ? t("sync.connected") : t("sync.disconnected")}
          </Pill>
        </div>

        {!connected && (
          <ConnectGoogleBlock
            authStatus={authStatus}
            authError={authError}
            onConnect={async () => {
              try {
                await login();
              } catch (err) {
                if (!(err instanceof GoogleAuthError)) {
                  console.error("[sync] login error", err);
                }
              }
            }}
          />
        )}

        {connected && !sheet && (
          <ConnectSheetBlock
            onSave={(s) => setSheet(s)}
            onDisconnect={async () => {
              await logout();
            }}
          />
        )}

        {connected && sheet && (
          <ConnectedBlock
            email={email}
            sheetTitle={sheet.title}
            sheetId={sheet.id}
            phase={phase}
            lastPushAt={lastPushAt}
            lastError={lastError}
            pendingCount={pendingCount}
            conflictCount={conflictCount}
            lang={i18n.language}
            onPushNow={async () => {
              setPhase("pushing");
              setError(null);
              try {
                const report = await syncAll(sheet.id, {
                  monthTemplateTitle,
                });
                // Pull failure aborts push (sync.ts behavior). Surface
                // whichever error occurred; if both halves succeeded, mark
                // last push and bump dbVersion when pull found changes.
                if (report.pullError) {
                  setError(report.pullError);
                  setPhase("error");
                  return;
                }
                if (report.pushError) {
                  setError(report.pushError);
                  setPhase("error");
                  return;
                }
                if (report.pull) {
                  const totalChanges =
                    sumValues(report.pull.inserted) +
                    sumValues(report.pull.updated);
                  if (totalChanges > 0) bumpDbVersion();
                }
                setLastPushAt(new Date().toISOString());
                setPhase("success");
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                setError(msg);
                setPhase("error");
              }
            }}
            onUnlinkSheet={() => setSheet(null)}
            onDisconnect={async () => {
              await logout();
              setSheet(null);
            }}
            manualOnly={manualOnly}
            onToggleManualOnly={setManualOnly}
            monthTemplateTitle={monthTemplateTitle}
            onChangeMonthTemplate={setMonthTemplateTitle}
          />
        )}
      </Card>
    </div>
  );
}

function ConnectGoogleBlock({
  authStatus,
  authError,
  onConnect,
}: {
  authStatus: string;
  authError: string | null;
  onConnect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <p className="t-label text-xs">{t("sync.intro")}</p>
      <Button
        size="sm"
        block
        onClick={onConnect}
        disabled={authStatus === "connecting"}
      >
        {authStatus === "connecting"
          ? t("sync.connecting")
          : t("sync.connectGoogle")}
      </Button>
      {authError && <p className="text-xs text-expense-ink">{authError}</p>}
    </div>
  );
}

function ConnectSheetBlock({
  onSave,
  onDisconnect,
}: {
  onSave: (s: { id: string; title: string }) => void;
  onDisconnect: () => void;
}) {
  const defaultSheetUrl =
    (import.meta.env.VITE_URL_GOOGLE_SHEET as string | undefined) ?? "";
  const { t } = useTranslation();
  const bumpDbVersion = useDbStore((s) => s.bumpVersion);
  const [url, setUrl] = useState(defaultSheetUrl);
  const [stage, setStage] = useState<"idle" | "validating" | "importing">(
    "idle",
  );
  const [err, setErr] = useState<string | null>(null);
  const busy = stage !== "idle";

  async function handleSave() {
    setErr(null);
    setStage("validating");
    try {
      const id = parseSpreadsheetId(url);
      if (!id) {
        setErr(t("sync.invalidUrl"));
        setStage("idle");
        return;
      }
      const meta = await getSpreadsheet(id);

      // Ensure every raw_* tab exists with up-to-date headers before pulling.
      // Without this, pullAll's getValues hits a 400 "Unable to parse range"
      // for any tab that doesn't yet exist in the spreadsheet (e.g. a Sheet
      // that pre-dates raw_feedback, or a brand-new Sheet on first connect).
      await ensureRawTabs(meta.spreadsheetId);

      // Phase 9b: import remote data BEFORE binding so the first auto-push
      // doesn't overwrite the existing sheet with our local seed-only state.
      // This is the cross-device bootstrap path — Sam's phone joining a
      // sheet you've already populated.
      setStage("importing");
      const report = await pullAll(meta.spreadsheetId);
      const totalImported =
        sumValues(report.inserted) + sumValues(report.updated);
      if (totalImported > 0) bumpDbVersion();

      onSave({ id: meta.spreadsheetId, title: meta.title });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStage("idle");
    }
  }

  return (
    <div className="space-y-3">
      <p className="t-label text-xs">{t("sync.pasteSheetIntro")}</p>
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="This is just a placeholder, Sam"
      />
      <div className="flex gap-2">
        <Button block size="sm" onClick={handleSave} disabled={busy}>
          {stage === "validating"
            ? t("sync.connecting")
            : stage === "importing"
              ? t("sync.importing")
              : t("sync.connectSheet")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDisconnect} disabled={busy}>
          {t("sync.disconnect")}
        </Button>
      </div>
      {err && <p className="text-xs text-expense-ink">{err}</p>}
    </div>
  );
}

function ConnectedBlock({
  email,
  sheetTitle,
  sheetId,
  phase,
  lastPushAt,
  lastError,
  pendingCount,
  conflictCount,
  lang,
  onPushNow,
  onUnlinkSheet,
  onDisconnect,
  manualOnly,
  onToggleManualOnly,
  // monthTemplateTitle,
  // onChangeMonthTemplate,
}: {
  email: string | null;
  sheetTitle: string;
  sheetId: string;
  phase: string;
  lastPushAt: string | null;
  lastError: string | null;
  pendingCount: number;
  conflictCount: number;
  lang: string;
  onPushNow: () => void;
  onUnlinkSheet: () => void;
  onDisconnect: () => void;
  manualOnly: boolean;
  onToggleManualOnly: (v: boolean) => void;
  monthTemplateTitle: string | null;
  onChangeMonthTemplate: (v: string | null) => void;
}) {
  const { t } = useTranslation();
  const busy = phase === "pushing" || phase === "pulling";

  return (
    <div className="space-y-3">
      <div className="space-y-1 text-xs">
        {email && (
          <p className="text-text-secondary">
            <span className="t-label">{t("sync.account")}: </span>
            <span className="font-medium text-text-primary">{email}</span>
          </p>
        )}
        <p className="text-text-secondary">
          <span className="t-label">{t("sync.sheet")}: </span>
          <a
            href={`https://docs.google.com/spreadsheets/d/${sheetId}`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-violet underline-offset-2 hover:underline"
          >
            {sheetTitle}
          </a>
        </p>
        <p className="text-text-secondary">
          <span className="t-label">{t("sync.lastPush")}: </span>
          <span className="font-medium text-text-primary">
            {lastPushAt ? formatRelative(lastPushAt, lang) : t("sync.never")}
          </span>
        </p>
        <p className="text-text-secondary">
          <span className="t-label">{t("sync.pendingChanges")}: </span>
          <span className="font-medium text-text-primary">{pendingCount}</span>
        </p>
      </div>

      <Button
        block
        size="sm"
        onClick={onPushNow}
        disabled={busy}
        className={cn(busy && "opacity-70")}
      >
        <span className="inline-flex items-center gap-2">
          {phase === "pushing" ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : phase === "success" ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {phase === "pushing"
            ? t("sync.pushing")
            : phase === "success"
              ? t("sync.pushedJustNow")
              : t("sync.pushNow")}
        </span>
      </Button>

      {lastError && phase !== "pushing" && (
        <p className="text-xs text-expense-ink flex items-start gap-1.5">
          <CloudOff className="size-3.5 mt-0.5" />
          <span>{lastError}</span>
        </p>
      )}

      {conflictCount > 0 && (
        <Link
          to="/sync/conflicts"
          className="block rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs hover:bg-warning/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/60"
        >
          <p className="font-medium text-warning-ink">
            {t("sync.conflicts.banner", { count: conflictCount })}
          </p>
          <p className="t-label text-[11px]">
            {t("sync.conflicts.bannerHint")}
          </p>
        </Link>
      )}

      <div className="flex items-center justify-between pt-1">
        <div className="text-xs">
          <p className="font-medium text-text-primary">
            {t("sync.manualOnly.label")}
          </p>
          <p className="t-label">{t("sync.manualOnly.hint")}</p>
        </div>
        <Toggle checked={manualOnly} onCheckedChange={onToggleManualOnly} />
      </div>

      {/* I leave this commented out for now in case we want to add it back in later */}
      
      {/* <div className="space-y-1.5 pt-1">
        <p className="text-xs font-medium text-text-primary">
          {t("sync.monthTemplate.label")}
        </p>
        <p className="t-label text-xs">{t("sync.monthTemplate.hint")}</p>
        <Input
          value={monthTemplateTitle ?? ""}
          onChange={(e) => {
            const trimmed = e.target.value.trim();
            onChangeMonthTemplate(trimmed.length > 0 ? trimmed : null);
          }}
          placeholder={t("sync.monthTemplate.placeholder")}
          aria-label={t("sync.monthTemplate.label")}
        />
      </div> */}

      <div className="flex gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onUnlinkSheet}>
          {t("sync.unlinkSheet")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDisconnect}>
          {t("sync.disconnect")}
        </Button>
      </div>
    </div>
  );
}

function formatRelative(iso: string, lang: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  const locale = lang?.startsWith("es") ? "es" : "en";
  if (sec < 60) return locale === "es" ? "ahora" : "just now";
  if (sec < 3600)
    return `${Math.floor(sec / 60)} ${locale === "es" ? "min" : "min"}`;
  if (sec < 86400)
    return `${Math.floor(sec / 3600)} ${locale === "es" ? "h" : "h"}`;
  return new Date(iso).toLocaleDateString(
    locale === "es" ? "es-ES" : "en-US",
    {
      day: "2-digit",
      month: "short",
    },
  );
}
