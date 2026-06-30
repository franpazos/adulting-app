/**
 * Quick-add sheet for creating a category from inside another flow
 * (most notably AddTransactionPage). Mirrors the field set of
 * CategoryFormPage minus the kind picker — the kind is inferred from
 * the context that opened the sheet (EXPENSE form → EXPENSE category,
 * INCOME form → INCOME category).
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, Card, Input, Sheet } from "@/components/ui";
import { categoriesRepo } from "@/lib/db";
import type { CategoryKind } from "@/lib/db/types";
import { useDbStore } from "@/store/dbStore";
import { cn } from "@/lib/utils/cn";
import { CATEGORY_COLOR_PALETTE } from "./colors";

interface CategoryQuickAddSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: CategoryKind;
  /** Called with the new category id after a successful save. */
  onCreated: (id: string) => void;
}

export function CategoryQuickAddSheet({
  open,
  onOpenChange,
  kind,
  onCreated,
}: CategoryQuickAddSheetProps) {
  const { t } = useTranslation();
  const bumpVersion = useDbStore((s) => s.bumpVersion);

  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(CATEGORY_COLOR_PALETTE[0]!);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset the form every time the sheet opens.
  useEffect(() => {
    if (open) {
      setName("");
      setColor(CATEGORY_COLOR_PALETTE[0]!);
      setSaveError(null);
    }
  }, [open]);

  const valid = name.trim().length > 0;

  function handleSave() {
    if (!valid) return;
    setSaveError(null);
    try {
      const created = categoriesRepo.create({
        name: name.trim(),
        kind,
        color,
        sort_order: 99,
      });
      bumpVersion();
      onCreated(created.id);
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("categoryQuickAdd.title")}
      description={t("categoryQuickAdd.description")}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="quick-cat-name"
            className="t-label text-[11px] uppercase tracking-wide"
          >
            {t("categoryQuickAdd.nameLabel")}
          </label>
          <Input
            id="quick-cat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("categoryQuickAdd.namePlaceholder")}
            maxLength={50}
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <p className="t-label text-[11px] uppercase tracking-wide">
            {t("categoryQuickAdd.colorLabel")}
          </p>
          <Card variant="flat">
            <div className="grid grid-cols-6 gap-3">
              {CATEGORY_COLOR_PALETTE.map((c) => (
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
        </div>

        {saveError && (
          <p className="text-xs text-expense-ink" role="alert">
            {saveError}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            block
            size="md"
            onClick={handleSave}
            disabled={!valid}
            className={!valid ? "opacity-60" : ""}
          >
            {t("categoryQuickAdd.saveCta")}
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
