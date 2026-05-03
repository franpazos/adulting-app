import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import { LogoMark } from "@/components/Logo";

export function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LogoMark className="size-7" />
          <span className="font-display text-lg font-semibold tracking-tight">
            {t("app.name")}
          </span>
        </div>
        <button
          type="button"
          aria-label="Notifications"
          className="relative size-10 grid place-items-center rounded-full bg-surface border border-border"
        >
          <Bell className="size-5 text-text-secondary" />
          <span className="absolute top-2 right-2 size-2 rounded-full bg-expense" />
        </button>
      </header>

      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {t("home.title")}
      </h1>

      <div className="rounded-2xl bg-surface border border-border p-5 shadow-card">
        <p className="text-text-secondary">
          Phase 0 scaffolding complete. Phase 1 (design system + screens) is
          next.
        </p>
      </div>
    </div>
  );
}
