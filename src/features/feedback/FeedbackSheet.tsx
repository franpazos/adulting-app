/**
 * Quick-capture sheet for creating or editing a feedback item. Opened
 * from the lightbulb button in AppHeader, or from the row tap on the
 * /feedback list page (in edit mode).
 *
 * No screenshots — by design. Title + message + severity + tag.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Button,
  Input,
  Sheet,
  SegmentedControl,
  type SegmentedOption,
} from "@/components/ui";
import { feedbackRepo } from "@/lib/db";
import { useDbStore } from "@/store/dbStore";
import type {
  Feedback,
  FeedbackSeverity,
  FeedbackTag,
} from "@/lib/db/types";
import { cn } from "@/lib/utils/cn";

interface FeedbackSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, sheet edits this row instead of creating a new one. */
  editing?: Feedback | null;
  /** Called after a successful save with the saved row's id. */
  onSaved?: (id: string) => void;
}

const TAG_VALUES: ReadonlyArray<FeedbackTag> = [
  "bug",
  "idea",
  "design",
  "other",
];
const TAG_EMOJI: Record<FeedbackTag, string> = {
  bug: "🐛",
  idea: "💡",
  design: "🎨",
  other: "❓",
};

const SEVERITY_VALUES: ReadonlyArray<FeedbackSeverity> = [
  "meh",
  "nice",
  "want",
  "sos",
];
const SEVERITY_EMOJI: Record<FeedbackSeverity, string> = {
  meh: "🥱",
  nice: "😬",
  want: "🙏",
  sos: "🆘",
};

export function FeedbackSheet({
  open,
  onOpenChange,
  editing,
  onSaved,
}: FeedbackSheetProps) {
  const { t } = useTranslation();
  const bumpDbVersion = useDbStore((s) => s.bumpVersion);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<FeedbackSeverity>("nice");
  const [tag, setTag] = useState<FeedbackTag>("idea");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset form on open. If editing, hydrate from the row.
  useEffect(() => {
    if (!open) return;
    setSaveError(null);
    if (editing) {
      setTitle(editing.title);
      setMessage(editing.message);
      setSeverity(editing.severity);
      setTag(editing.tag);
    } else {
      setTitle("");
      setMessage("");
      setSeverity("nice");
      setTag("idea");
    }
  }, [open, editing]);

  const tagOptions: ReadonlyArray<SegmentedOption<FeedbackTag>> =
    TAG_VALUES.map((v) => ({
      value: v,
      label: `${TAG_EMOJI[v]} ${t(`feedback.tag.${v}`)}`,
    }));

  // Severity rendered as a 2x2 grid of emoji cards rather than a segmented
  // control — labels are too long to fit one row on mobile.
  const valid = title.trim().length > 0 && message.trim().length > 0;

  function handleSave() {
    if (!valid) return;
    setSaveError(null);
    try {
      if (editing) {
        feedbackRepo.update(editing.id, {
          title: title.trim(),
          message: message.trim(),
          severity,
          tag,
        });
        bumpDbVersion();
        onSaved?.(editing.id);
      } else {
        const created = feedbackRepo.create({
          title: title.trim(),
          message: message.trim(),
          severity,
          tag,
        });
        bumpDbVersion();
        onSaved?.(created.id);
      }
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        editing ? t("feedback.sheet.editTitle") : t("feedback.sheet.newTitle")
      }
      description={t("feedback.sheet.description")}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="feedback-title"
            className="t-label text-[11px] uppercase tracking-wide"
          >
            {t("feedback.fields.title")}
          </label>
          <Input
            id="feedback-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("feedback.fields.titlePlaceholder")}
            maxLength={120}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="feedback-message"
            className="t-label text-[11px] uppercase tracking-wide"
          >
            {t("feedback.fields.message")}
          </label>
          <textarea
            id="feedback-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("feedback.fields.messagePlaceholder")}
            rows={4}
            maxLength={2000}
            className={cn(
              "w-full rounded-xl border border-border bg-surface text-text-primary",
              "px-3 py-2 text-sm leading-relaxed resize-none",
              "focus:outline-none focus:border-violet focus:ring-2 focus:ring-violet/30",
            )}
          />
        </div>

        <div className="space-y-1.5">
          <p className="t-label text-[11px] uppercase tracking-wide">
            {t("feedback.fields.tag")}
          </p>
          <SegmentedControl
            options={tagOptions}
            value={tag}
            onChange={setTag}
            tone="surface"
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <p className="t-label text-[11px] uppercase tracking-wide">
            {t("feedback.fields.severity")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SEVERITY_VALUES.map((v) => {
              const active = v === severity;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSeverity(v)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/60",
                    active
                      ? "border-violet bg-violet/15 text-violet-ink dark:bg-violet/25 dark:text-violet-soft"
                      : "border-border bg-surface text-text-secondary hover:text-text-primary",
                  )}
                >
                  <span className="text-base leading-none" aria-hidden>
                    {SEVERITY_EMOJI[v]}
                  </span>
                  <span className="flex-1 truncate">
                    {t(`feedback.severity.${v}`)}
                  </span>
                </button>
              );
            })}
          </div>
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
            {editing
              ? t("feedback.sheet.saveEdit")
              : t("feedback.sheet.saveNew")}
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
