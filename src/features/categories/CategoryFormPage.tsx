import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Archive, RotateCcw } from "lucide-react";

import {
  Button,
  Card,
  CardEyebrow,
  IconButton,
  Input,
  Pill,
  SegmentedControl,
  type SegmentedOption,
} from "@/components/ui";
import { categoriesRepo } from "@/lib/db";
import type { CategoryKind } from "@/lib/db/types";
import { useDbStore } from "@/store/dbStore";
import { cn } from "@/lib/utils/cn";
import { CATEGORY_COLOR_PALETTE as COLOR_PALETTE } from "./colors";

export function CategoryFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = id !== undefined && id !== "new";
  const dbReady = useDbStore((s) => s.status === "ready");
  const bumpVersion = useDbStore((s) => s.bumpVersion);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>("EXPENSE");
  const [color, setColor] = useState(COLOR_PALETTE[0]!);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!dbReady || !isEdit || !id) return;
    const c = categoriesRepo.getById(id);
    if (!c) return;
    setName(c.name);
    setKind(c.kind);
    setColor(c.color ?? COLOR_PALETTE[0]!);
    setIsActive(c.is_active);
  }, [dbReady, isEdit, id]);

  const valid = useMemo(() => name.trim().length > 0, [name]);

  const kindOptions: ReadonlyArray<SegmentedOption<CategoryKind>> = [
    { value: "EXPENSE", label: t("categories.kind.expense") },
    { value: "INCOME", label: t("categories.kind.income") },
  ];

  function handleArchive() {
    if (!isEdit || !id) return;
    if (!window.confirm(t("categories.confirmArchive"))) return;
    try {
      categoriesRepo.softDelete(id);
      bumpVersion();
      navigate("/categories");
    } catch (err) {
      console.error("[category-form] archive failed", err);
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleReactivate() {
    if (!isEdit || !id) return;
    try {
      categoriesRepo.reactivate(id);
      bumpVersion();
      navigate("/categories");
    } catch (err) {
      console.error("[category-form] reactivate failed", err);
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleSave() {
    if (!dbReady || !valid || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (isEdit && id) {
        categoriesRepo.update(id, {
          name: name.trim(),
          kind,
          color,
        });
      } else {
        categoriesRepo.create({
          name: name.trim(),
          kind,
          color,
          sort_order: 99,
        });
      }
      bumpVersion();
      navigate("/categories");
    } catch (err) {
      console.error("[category-form] save failed", err);
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-32">
      <div className="flex items-center justify-between pt-4 pb-2">
        <IconButton
          aria-label={t("common.cancel")}
          onClick={() => navigate(-1)}
        >
          <ChevronLeft className="size-5" />
        </IconButton>
        <div className="flex items-center gap-2">
          <h1 className="font-display text-base font-semibold">
            {isEdit ? t("categories.editTitle") : t("categories.newTitle")}
          </h1>
          {isEdit && !isActive && (
            <Pill tone="positive" className="h-5 px-2 text-[10px]">
              {t("categories.archivedBadge")}
            </Pill>
          )}
        </div>
        <span className="size-10" aria-hidden />
      </div>

      <section className="space-y-2">
        <CardEyebrow>{t("categories.fields.kind")}</CardEyebrow>
        <SegmentedControl
          options={kindOptions}
          value={kind}
          onChange={setKind}
          className="w-full justify-stretch [&>button]:flex-1"
          ariaLabel={t("categories.fields.kind")}
        />
      </section>

      <section className="mt-5 space-y-2">
        <CardEyebrow>{t("categories.fields.name")}</CardEyebrow>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("categories.fields.namePlaceholder")}
        />
      </section>

      <section className="mt-5 space-y-2">
        <CardEyebrow>{t("categories.fields.color")}</CardEyebrow>
        <Card variant="flat">
          <div className="grid grid-cols-6 gap-3">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                className={cn(
                  "size-9 rounded-full transition-transform",
                  c === color
                    ? "ring-2 ring-offset-2 ring-offset-bg ring-violet scale-110"
                    : "active:scale-95",
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </Card>
      </section>

      {isEdit && (
        <section className="mt-5 space-y-2">
          <CardEyebrow>{t("categories.actions")}</CardEyebrow>
          <Card variant="flat" className="p-0">
            {isActive ? (
              <ActionRow
                icon={<Archive className="size-4" />}
                label={t("categories.archive")}
                hint={t("categories.archiveHint")}
                onClick={handleArchive}
              />
            ) : (
              <ActionRow
                icon={<RotateCcw className="size-4" />}
                label={t("categories.reactivate")}
                hint={t("categories.reactivateHint")}
                onClick={handleReactivate}
              />
            )}
          </Card>
        </section>
      )}

      {saveError && (
        <p className="mt-3 text-sm text-expense-ink" role="alert">
          {saveError}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 pointer-events-none">
        <div className="mx-auto max-w-md px-4 pb-safe-bottom pb-4 pointer-events-auto">
          <Button
            block
            size="lg"
            disabled={!valid || saving}
            onClick={handleSave}
            className="bg-gradient-to-br from-violet-soft via-violet to-violet-ink text-white shadow-violet-glow"
          >
            {saving ? t("common.loading") : t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActionRow({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors active:bg-surface-2 text-text-primary"
    >
      <span className="grid place-items-center size-8 rounded-lg bg-surface-2">
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {hint && (
          <span className="block text-[11px] text-text-secondary mt-0.5">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}
