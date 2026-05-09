import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";

import {
  Button,
  Card,
  CardEyebrow,
  IconButton,
  Input,
  SegmentedControl,
  type SegmentedOption,
} from "@/components/ui";
import { categoriesRepo } from "@/lib/db";
import type { CategoryKind } from "@/lib/db/types";
import { useDbStore } from "@/store/dbStore";
import { cn } from "@/lib/utils/cn";

const COLOR_PALETTE: ReadonlyArray<string> = [
  "#7B5CF6",
  "#22C55E",
  "#FF7D6B",
  "#3B82F6",
  "#F59E0B",
  "#A891FA",
  "#34D36E",
  "#FF8A7A",
  "#60A5FA",
  "#FBAF38",
  "#9CA3AF",
  "#EC4899",
];

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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!dbReady || !isEdit || !id) return;
    const c = categoriesRepo.getById(id);
    if (!c) return;
    setName(c.name);
    setKind(c.kind);
    setColor(c.color ?? COLOR_PALETTE[0]!);
  }, [dbReady, isEdit, id]);

  const valid = useMemo(() => name.trim().length > 0, [name]);

  const kindOptions: ReadonlyArray<SegmentedOption<CategoryKind>> = [
    { value: "EXPENSE", label: t("categories.kind.expense") },
    { value: "INCOME", label: t("categories.kind.income") },
  ];

  function handleSave() {
    if (!dbReady || !valid || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (isEdit && id) {
        // categoriesRepo doesn't expose `update` yet; do an inline UPDATE.
        // (Phase 7b candidate to formalize.)
        const existing = categoriesRepo.getById(id);
        if (existing) {
          // We have to reach into client.exec because update isn't on the repo.
          // Keep it explicit and inline rather than adding a half-baked method.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
        }
        updateCategoryInline(id, { name: name.trim(), kind, color });
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
        <h1 className="font-display text-base font-semibold">
          {isEdit ? t("categories.editTitle") : t("categories.newTitle")}
        </h1>
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

// Inline update helper — avoids broadening the repo for this single call site.
// If categories grow more edit operations, promote this to categoriesRepo.update.
import { exec } from "@/lib/db/client";
import { nowIso } from "@/lib/db/repositories/_helpers";

function updateCategoryInline(
  id: string,
  patch: { name: string; kind: CategoryKind; color: string },
) {
  exec(
    `UPDATE categories SET name = ?, kind = ?, color = ?, updated_at = ?
     WHERE id = ?`,
    [patch.name, patch.kind, patch.color, nowIso(), id],
  );
}
