import { useTranslation } from "react-i18next";
import { Database } from "lucide-react";
import { Card, CardEyebrow, Pill } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
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
        <CardEyebrow>Appearance</CardEyebrow>
        <Card variant="flat" className="flex items-center justify-between">
          <span className="text-sm font-medium">Theme</span>
          <ThemeToggle />
        </Card>
      </section>

      <section className="space-y-2">
        <CardEyebrow>Local database</CardEyebrow>
        <Card variant="flat" className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Database className="size-4 text-violet" /> Backend
            </span>
            <Pill tone={backend === "opfs-sahpool" ? "positive" : "warning"}>
              {backend === "opfs-sahpool" ? "OPFS (durable)" : "in-memory"}
            </Pill>
          </div>
          {seeded && (
            <p className="t-label">Seeded fresh dataset on this load.</p>
          )}
          {warning && <p className="t-label text-warning">{warning}</p>}
        </Card>
      </section>

      <section className="space-y-2">
        <CardEyebrow>Project</CardEyebrow>
        <Card variant="flat" className="text-sm text-text-secondary">
          <p>
            Phase 3 (Local SQLite + seed data) is in place. Settlements
            recompute on edits and FX support for USD debts land in Phase 4.
          </p>
        </Card>
      </section>
    </div>
  );
}
