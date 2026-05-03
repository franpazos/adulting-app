import { useTranslation } from "react-i18next";
import { Card, CardEyebrow } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

export function SettingsPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8 space-y-5">
      <h1 className="h-display">{t("more.items.settings")}</h1>

      <section className="space-y-2">
        <CardEyebrow>Appearance</CardEyebrow>
        <Card variant="flat" className="flex items-center justify-between">
          <span className="text-sm font-medium">Theme</span>
          <ThemeToggle />
        </Card>
      </section>

      <section className="space-y-2">
        <CardEyebrow>Project</CardEyebrow>
        <Card variant="flat" className="text-sm text-text-secondary">
          <p>Phase 1 (Design system) is in place. The full Settings hierarchy
          — Appearance, Language, Defaults, Google Sheets Sync, Backups & Data,
          About — lands in Phase 7.</p>
        </Card>
      </section>
    </div>
  );
}
