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
import { useTranslation } from "react-i18next";
import { CheckCircle2, Cloud, CloudOff, RefreshCw, Sparkles } from "lucide-react";

import { Button, Card, Input, Pill } from "@/components/ui";
import {
  GoogleAuthError,
  isGoogleClientConfigured,
  login,
  logout,
} from "@/lib/google/auth";
import { hasValidToken, useAuthStore } from "@/store/authStore";
import { useSyncStore } from "@/store/syncStore";
import { listPending } from "@/lib/sync/queue";
import { useDbStore } from "@/store/dbStore";
import { parseSpreadsheetId } from "@/lib/google/drive-api";
import { getSpreadsheet } from "@/lib/google/sheets-api";
import { pushAll } from "@/lib/sync/push";
import { cn } from "@/lib/utils/cn";

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
  const phase = useSyncStore((s) => s.phase);
  const setPhase = useSyncStore((s) => s.setPhase);
  const lastPushAt = useSyncStore((s) => s.lastPushAt);
  const setLastPushAt = useSyncStore((s) => s.setLastPushAt);
  const lastError = useSyncStore((s) => s.lastError);
  const setError = useSyncStore((s) => s.setError);

  const connected = authStatus === "connected" && hasValidToken(token);
  const configured = isGoogleClientConfigured();

  // Update pending count whenever the DB version moves.
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    if (!dbReady) return;
    setPendingCount(listPending().length);
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
            lang={i18n.language}
            onPushNow={async () => {
              setPhase("pushing");
              setError(null);
              try {
                await pushAll(sheet.id);
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
      {authError && <p className="text-xs text-expense">{authError}</p>}
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
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    setBusy(true);
    setErr(null);
    try {
      const id = parseSpreadsheetId(url);
      if (!id) {
        setErr(t("sync.invalidUrl"));
        setBusy(false);
        return;
      }
      const meta = await getSpreadsheet(id);
      onSave({ id: meta.spreadsheetId, title: meta.title });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="t-label text-xs">{t("sync.pasteSheetIntro")}</p>
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://docs.google.com/spreadsheets/d/…"
      />
      <div className="flex gap-2">
        <Button block size="sm" onClick={handleSave} disabled={busy}>
          {busy ? t("sync.connecting") : t("sync.connectSheet")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDisconnect}>
          {t("sync.disconnect")}
        </Button>
      </div>
      {err && <p className="text-xs text-expense">{err}</p>}
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
  lang,
  onPushNow,
  onUnlinkSheet,
  onDisconnect,
}: {
  email: string | null;
  sheetTitle: string;
  sheetId: string;
  phase: string;
  lastPushAt: string | null;
  lastError: string | null;
  pendingCount: number;
  lang: string;
  onPushNow: () => void;
  onUnlinkSheet: () => void;
  onDisconnect: () => void;
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
        <p className="text-xs text-expense flex items-start gap-1.5">
          <CloudOff className="size-3.5 mt-0.5" />
          <span>{lastError}</span>
        </p>
      )}

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
