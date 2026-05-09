import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Database,
  Download,
  Info,
  RotateCcw,
  Sliders,
  Trash2,
} from "lucide-react";
import {
  Button,
  Card,
  CardEyebrow,
  Pill,
  SegmentedControl,
  Slider,
  type SegmentedOption,
} from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { SyncCard } from "@/features/sync/SyncCard";
import { useDbStore } from "@/store/dbStore";
import { useDefaultsStore } from "@/store/defaultsStore";
import { exportDb } from "@/lib/db/client";
import { clearSnapshot } from "@/lib/db/persistence";
import type { CashSource, OwnerType } from "@/lib/db/types";

export function SettingsPage() {
  const { t } = useTranslation();
  const backend = useDbStore((s) => s.backend);
  const warning = useDbStore((s) => s.warning);
  const seeded = useDbStore((s) => s.seededOnThisLoad);

  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8 space-y-5">
      <h1 className="h-display">{t("more.items.settings")}</h1>

      <section className="space-y-2">
        <CardEyebrow>{t("settings.appearance")}</CardEyebrow>
        <Card variant="flat" className="flex items-center justify-between">
          <span className="text-sm font-medium">{t("settings.theme")}</span>
          <ThemeToggle />
        </Card>
        <Card variant="flat" className="flex items-center justify-between">
          <span className="text-sm font-medium">{t("settings.language")}</span>
          <LanguageToggle />
        </Card>
      </section>

      <section className="space-y-2">
        <CardEyebrow>{t("settings.defaults.section")}</CardEyebrow>
        <DefaultsCard />
      </section>

      <section className="space-y-2">
        <CardEyebrow>{t("sync.section")}</CardEyebrow>
        <SyncCard />
      </section>

      <section className="space-y-2">
        <CardEyebrow>{t("settings.database")}</CardEyebrow>
        <Card variant="flat" className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Database className="size-4 text-violet" />{" "}
              {t("settings.backend")}
            </span>
            <Pill
              tone={
                backend === "opfs-sahpool" || backend === "memory-snapshot"
                  ? "positive"
                  : "warning"
              }
            >
              {backend === "opfs-sahpool"
                ? t("settings.backendDurable")
                : backend === "memory-snapshot"
                  ? t("settings.backendSnapshot")
                  : t("settings.backendMemory")}
            </Pill>
          </div>
          {seeded && <p className="t-label">{t("settings.seededFresh")}</p>}
          {warning && <p className="t-label text-warning-ink">{warning}</p>}
        </Card>
      </section>

      <section className="space-y-2">
        <CardEyebrow>{t("settings.backups.section")}</CardEyebrow>
        <BackupsCard />
      </section>

      <section className="space-y-2">
        <CardEyebrow>{t("settings.about.section")}</CardEyebrow>
        <AboutCard />
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults — pre-fill values for Add Expense.
// ─────────────────────────────────────────────────────────────────────────────

function DefaultsCard() {
  const { t } = useTranslation();
  const source = useDefaultsStore((s) => s.source);
  const owner = useDefaultsStore((s) => s.owner);
  const splitFranPercent = useDefaultsStore((s) => s.splitFranPercent);
  const setSource = useDefaultsStore((s) => s.setSource);
  const setOwner = useDefaultsStore((s) => s.setOwner);
  const setSplitFranPercent = useDefaultsStore((s) => s.setSplitFranPercent);
  const reset = useDefaultsStore((s) => s.reset);

  const sourceOptions: ReadonlyArray<SegmentedOption<CashSource>> = [
    { value: "FRAN_PERSONAL", label: t("addExpense.who.fran") },
    { value: "SAM_PERSONAL", label: t("addExpense.who.sam") },
    { value: "JOINT", label: t("addExpense.who.joint") },
  ];

  const ownerOptions: ReadonlyArray<SegmentedOption<OwnerType>> = [
    { value: "FRAN", label: t("addExpense.who.fran") },
    { value: "SAM", label: t("addExpense.who.sam") },
    { value: "HOUSEHOLD", label: t("addExpense.who.household") },
  ];

  const showSplit =
    owner === "HOUSEHOLD" &&
    (source === "FRAN_PERSONAL" || source === "SAM_PERSONAL");

  return (
    <Card variant="flat" className="space-y-4">
      <div className="flex items-center gap-2">
        <Sliders className="size-4 text-violet" />
        <p className="text-sm font-medium">{t("settings.defaults.title")}</p>
      </div>
      <p className="t-label text-xs">{t("settings.defaults.hint")}</p>

      <div className="space-y-2">
        <p className="t-label text-xs">{t("addExpense.paidFrom")}</p>
        <SegmentedControl
          options={sourceOptions}
          value={source}
          onChange={setSource}
          tone="surface"
          className="w-full justify-stretch [&>button]:flex-1"
        />
      </div>

      <div className="space-y-2">
        <p className="t-label text-xs">{t("addExpense.belongsTo")}</p>
        <SegmentedControl
          options={ownerOptions}
          value={owner}
          onChange={setOwner}
          tone="surface"
          className="w-full justify-stretch [&>button]:flex-1"
        />
      </div>

      {showSplit && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="t-label text-xs">{t("addExpense.split")}</p>
            <p className="t-label text-xs tabular-nums">
              {t("addExpense.splitLabel", {
                fran: splitFranPercent,
                sam: 100 - splitFranPercent,
              })}
            </p>
          </div>
          <Slider
            min={0}
            max={100}
            step={5}
            value={splitFranPercent}
            onValueChange={setSplitFranPercent}
          />
        </div>
      )}

      <Button variant="ghost" size="sm" onClick={reset}>
        <span className="inline-flex items-center gap-1.5">
          <RotateCcw className="size-3.5" /> {t("common.reset")}
        </span>
      </Button>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Backups & Data — download a snapshot, wipe local state.
// ─────────────────────────────────────────────────────────────────────────────

function BackupsCard() {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const [resetting, setResetting] = useState(false);

  function handleDownload() {
    setDownloading(true);
    try {
      const bytes = exportDb();
      if (!bytes) {
        alert(t("settings.backups.exportError"));
        return;
      }
      const blob = new Blob([new Uint8Array(bytes)], {
        type: "application/x-sqlite3",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `adulting-${new Date().toISOString().slice(0, 10)}.sqlite3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  async function handleReset() {
    if (!confirm(t("settings.backups.resetConfirm"))) return;
    setResetting(true);
    try {
      await clearSnapshot();
      // Clear all localStorage so persisted Zustand stores reset too.
      // The next reload re-seeds everything from a clean slate.
      localStorage.clear();
      // OPFS data on Chrome stays put — those files belong to the browser
      // origin storage. To clear it, the user can use DevTools → Application
      // → Storage → Clear site data. Documented in settings.backups.resetHint.
      window.location.reload();
    } catch (err) {
      console.error("[settings] reset failed:", err);
      setResetting(false);
    }
  }

  return (
    <Card variant="flat" className="space-y-3">
      <div className="flex items-center gap-2">
        <Database className="size-4 text-violet" />
        <p className="text-sm font-medium">
          {t("settings.backups.title")}
        </p>
      </div>
      <p className="t-label text-xs">{t("settings.backups.hint")}</p>

      <Button size="sm" variant="secondary" onClick={handleDownload} disabled={downloading}>
        <span className="inline-flex items-center gap-2">
          <Download className="size-4" />
          {t("settings.backups.download")}
        </span>
      </Button>

      <div className="pt-2 border-t border-border/60 space-y-2">
        <p className="t-label text-xs flex items-start gap-1.5 text-warning-ink">
          <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
          <span>{t("settings.backups.resetHint")}</span>
        </p>
        <Button
          size="sm"
          variant="destructive"
          onClick={handleReset}
          disabled={resetting}
        >
          <span className="inline-flex items-center gap-2">
            <Trash2 className="size-4" />
            {resetting
              ? t("settings.backups.resetting")
              : t("settings.backups.reset")}
          </span>
        </Button>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// About — version + build info.
// ─────────────────────────────────────────────────────────────────────────────

function AboutCard() {
  const { t } = useTranslation();
  return (
    <Card variant="flat" className="space-y-3">
      <div className="flex items-center gap-2">
        <Info className="size-4 text-violet" />
        <p className="text-sm font-medium">{t("settings.about.title")}</p>
      </div>
      <dl className="text-xs space-y-1.5">
        <div className="flex justify-between">
          <dt className="t-label">{t("settings.about.version")}</dt>
          <dd className="font-medium tabular-nums">{__APP_VERSION__}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="t-label">{t("settings.about.build")}</dt>
          <dd className="font-medium tabular-nums">{__BUILD_DATE__}</dd>
        </div>
      </dl>
      <p className="t-label text-xs">{t("settings.about.tagline")}</p>
    </Card>
  );
}
