/**
 * "Buzón de sugerencias" — lists all active feedback rows. Tap a row to
 * read the full message in a sheet, with edit + delete actions.
 *
 * Temporary feature for the beta period. See feedbackRepo / migrations
 * v3 for the storage details. Remove when retiring.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Plus, Pencil, Trash2 } from "lucide-react";

import {
  Button,
  CardEyebrow,
  EmptyState,
  IconButton,
  Pill,
  Sheet,
} from "@/components/ui";
import { feedbackRepo } from "@/lib/db";
import { useDbStore } from "@/store/dbStore";
import type { Feedback, FeedbackSeverity, FeedbackTag } from "@/lib/db/types";
import { FeedbackSheet } from "./FeedbackSheet";
import { cn } from "@/lib/utils/cn";

const TAG_EMOJI: Record<FeedbackTag, string> = {
  bug: "🐛",
  idea: "💡",
  design: "🎨",
  other: "❓",
};

const SEVERITY_EMOJI: Record<FeedbackSeverity, string> = {
  meh: "🥱",
  nice: "😬",
  want: "🙏",
  sos: "🆘",
};

export function FeedbackPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const dbReady = useDbStore((s) => s.status === "ready");
  const dbVersion = useDbStore((s) => s.dbVersion);
  const bumpDbVersion = useDbStore((s) => s.bumpVersion);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Feedback | null>(null);
  const [viewing, setViewing] = useState<Feedback | null>(null);

  const items = useMemo(
    () => (dbReady ? feedbackRepo.list() : []),
    [dbReady, dbVersion],
  );

  const lang = i18n.language?.startsWith("es") ? "es" : "en";

  function handleDelete(f: Feedback) {
    if (!confirm(t("feedback.confirmDelete"))) return;
    feedbackRepo.softDelete(f.id);
    bumpDbVersion();
    setViewing(null);
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-5">
      <div className="flex items-center justify-between">
        <IconButton
          aria-label={t("common.cancel")}
          onClick={() => navigate("/settings")}
        >
          <ChevronLeft className="size-5" />
        </IconButton>
        <h1 className="font-display text-base font-semibold">
          {t("feedback.title")}
        </h1>
        <IconButton
          aria-label={t("feedback.newCta")}
          variant="violet"
          size="sm"
          onClick={() => setCreating(true)}
        >
          <Plus className="size-4" />
        </IconButton>
      </div>

      <p className="t-label text-xs">{t("feedback.intro")}</p>

      {items.length === 0 ? (
        <EmptyState
          variant="centered"
          title={t("feedback.empty.title")}
          description={t("feedback.empty.description")}
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              {t("feedback.newCta")}
            </Button>
          }
        />
      ) : (
        <>
          <CardEyebrow>
            {t("feedback.count", { count: items.length })}
          </CardEyebrow>
          <ul className="space-y-2">
            {items.map((f) => (
              <li key={f.id}>
                <FeedbackRow
                  item={f}
                  lang={lang}
                  onClick={() => setViewing(f)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Create new */}
      <FeedbackSheet open={creating} onOpenChange={setCreating} />

      {/* Edit existing */}
      <FeedbackSheet
        open={Boolean(editing)}
        onOpenChange={(o) => !o && setEditing(null)}
        editing={editing}
        onSaved={() => setEditing(null)}
      />

      {/* View / detail */}
      <Sheet
        open={Boolean(viewing)}
        onOpenChange={(o) => !o && setViewing(null)}
        title={viewing?.title}
      >
        {viewing && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="violet">
                <span aria-hidden>{TAG_EMOJI[viewing.tag]}</span>
                <span>{t(`feedback.tag.${viewing.tag}`)}</span>
              </Pill>
              <Pill tone={severityTone(viewing.severity)}>
                <span aria-hidden>{SEVERITY_EMOJI[viewing.severity]}</span>
                <span>{t(`feedback.severity.${viewing.severity}`)}</span>
              </Pill>
              <span className="t-label text-[11px] ml-auto">
                {formatDate(viewing.created_at, lang)}
              </span>
            </div>
            <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
              {viewing.message}
            </p>
            <div className="flex gap-2 pt-1 border-t border-border/60">
              <Button
                size="sm"
                onClick={() => {
                  const ed = viewing;
                  setViewing(null);
                  setEditing(ed);
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Pencil className="size-3.5" />
                  {t("common.edit")}
                </span>
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleDelete(viewing)}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Trash2 className="size-3.5" />
                  {t("common.delete")}
                </span>
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function FeedbackRow({
  item,
  lang,
  onClick,
}: {
  item: Feedback;
  lang: "en" | "es";
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-2xl bg-surface border border-border shadow-card",
        "px-3.5 py-3 active:scale-[0.99] transition-transform",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/60",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid place-items-center size-9 rounded-xl bg-violet/10 text-base shrink-0"
        >
          {TAG_EMOJI[item.tag]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{item.title}</p>
          <p className="t-label text-[11px] line-clamp-2 mt-0.5">
            {item.message}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Pill tone={severityTone(item.severity)} className="h-5 px-2 text-[10px]">
              <span aria-hidden>{SEVERITY_EMOJI[item.severity]}</span>
              <span>{t(`feedback.severity.${item.severity}`)}</span>
            </Pill>
            <span className="t-label text-[11px]">
              {formatDate(item.created_at, lang)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function severityTone(s: FeedbackSeverity) {
  if (s === "sos") return "expense" as const;
  if (s === "want") return "warning" as const;
  if (s === "nice") return "info" as const;
  return "neutral" as const;
}

function formatDate(iso: string, lang: "en" | "es"): string {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === "es" ? "es-ES" : "en-US", {
    day: "numeric",
    month: "short",
  });
}
