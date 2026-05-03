import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { Card, CardEyebrow, IconButton } from "@/components/ui";
import { categoriesRepo } from "@/lib/db";
import type { Category } from "@/lib/db/types";
import { useDbStore } from "@/store/dbStore";
import { cn } from "@/lib/utils/cn";

export function CategoriesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dbReady = useDbStore((s) => s.status === "ready");
  const dbVersion = useDbStore((s) => s.dbVersion);

  const all = useMemo(
    () => (dbReady ? categoriesRepo.list() : []),
    [dbReady, dbVersion],
  );
  const expense = all.filter((c) => c.kind === "EXPENSE");
  const income = all.filter((c) => c.kind === "INCOME");

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-5">
      <div className="flex items-center justify-between">
        <IconButton
          aria-label={t("settlements.back")}
          onClick={() => navigate("/more")}
        >
          <ChevronLeft className="size-5" />
        </IconButton>
        <h1 className="font-display text-base font-semibold">
          {t("categories.title")}
        </h1>
        <IconButton
          aria-label={t("categories.add")}
          variant="violet"
          size="sm"
          onClick={() => navigate("/categories/new")}
        >
          <Plus className="size-4" />
        </IconButton>
      </div>

      {expense.length > 0 && (
        <Section title={t("categories.expense")}>
          {expense.map((c) => (
            <Row key={c.id} category={c} />
          ))}
        </Section>
      )}
      {income.length > 0 && (
        <Section title={t("categories.income")}>
          {income.map((c) => (
            <Row key={c.id} category={c} />
          ))}
        </Section>
      )}

      {all.length === 0 && (
        <Card variant="flat" className="text-text-secondary text-sm text-center">
          {t("categories.empty")}
        </Card>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <CardEyebrow>{title}</CardEyebrow>
      <ul className="rounded-2xl bg-surface border border-border shadow-card divide-y divide-border overflow-hidden">
        {children}
      </ul>
    </section>
  );
}

function Row({ category }: { category: Category }) {
  const navigate = useNavigate();
  return (
    <li>
      <button
        type="button"
        onClick={() => navigate(`/categories/${category.id}`)}
        className={cn(
          "w-full flex items-center gap-3 px-3.5 py-3 text-left",
          "active:bg-surface-2 transition-colors",
        )}
      >
        <span
          className="grid place-items-center size-9 rounded-xl text-sm font-semibold"
          style={{
            background: tinted(category.color),
            color: category.color ?? "currentColor",
          }}
        >
          {category.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="flex-1 text-sm font-medium">{category.name}</span>
        {category.color && (
          <span
            className="size-3 rounded-full"
            style={{ background: category.color }}
          />
        )}
        <ChevronRight className="size-4 text-text-muted" />
      </button>
    </li>
  );
}

function tinted(color: string | null): string {
  if (!color) return "rgb(var(--color-violet-tint))";
  // Approximation of CSS color-mix(in oklab, color 16%, transparent) using hex+alpha.
  return `${color}29`; // hex alpha 0x29 ≈ 16%
}
