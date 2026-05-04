import { useTranslation } from "react-i18next";
import { Database } from "lucide-react";
import { Card, CardEyebrow, Pill } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { SyncCard } from "@/features/sync/SyncCard";
import { useDbStore } from "@/store/dbStore";

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
            <Pill tone={backend === "opfs-sahpool" ? "positive" : "warning"}>
              {backend === "opfs-sahpool"
                ? t("settings.backendDurable")
                : t("settings.backendMemory")}
            </Pill>
          </div>
          {seeded && (
            <p className="t-label">{t("settings.seededFresh")}</p>
          )}
          {warning && <p className="t-label text-warning">{warning}</p>}
        </Card>
      </section>
    </div>
  );
}
