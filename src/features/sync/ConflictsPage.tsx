import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Check, X } from "lucide-react";

import { Button, Card, EmptyState, IconButton, Pill } from "@/components/ui";
import { useDbStore } from "@/store/dbStore";
import {
  listUnresolvedConflicts,
  resolveKeepLocal,
  resolveUseRemote,
  type SyncConflict,
} from "@/lib/sync/conflicts";
import { applyRemoteToLocal } from "@/lib/sync/pull";

/**
 * Lists unresolved sync conflicts and lets the user pick a side per
 * conflict. Each row shows the entity type, identifying field
 * (description / name / etc.), and side-by-side updated_at + the
 * differing fields.
 *
 * "Keep mine" leaves local untouched; the existing PENDING queue entry
 * means the next push wins. "Use remote" applies the stashed remote
 * payload locally and drops the PENDING queue entry.
 */
export function ConflictsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dbReady = useDbStore((s) => s.status === "ready");
  const dbVersion = useDbStore((s) => s.dbVersion);
  const bumpDbVersion = useDbStore((s) => s.bumpVersion);

  // Local re-render trigger after each resolution.
  const [tick, setTick] = useState(0);

  const conflicts = useMemo<SyncConflict[]>(
    () => (dbReady ? listUnresolvedConflicts() : []),
    [dbReady, dbVersion, tick],
  );

  function handleKeepLocal(id: string) {
    resolveKeepLocal(id);
    setTick((n) => n + 1);
  }

  function handleUseRemote(id: string) {
    resolveUseRemote(id, applyRemoteToLocal);
    bumpDbVersion();
    setTick((n) => n + 1);
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-5">
      <div className="flex items-center gap-2">
        <IconButton
          aria-label={t("conflicts.back")}
          onClick={() => navigate(-1)}
        >
          <ChevronLeft className="size-5" />
        </IconButton>
        <h1 className="h-display flex-1">{t("conflicts.title")}</h1>
        {conflicts.length > 0 && (
          <Pill tone="warning">{conflicts.length}</Pill>
        )}
      </div>

      <p className="t-label text-xs">{t("conflicts.intro")}</p>

      {conflicts.length === 0 ? (
        <EmptyState
          variant="centered"
          title={t("conflicts.empty.title")}
          description={t("conflicts.empty.description")}
        />
      ) : (
        <ul className="space-y-3">
          {conflicts.map((c) => (
            <li key={c.id}>
              <ConflictCard
                conflict={c}
                onKeepLocal={() => handleKeepLocal(c.id)}
                onUseRemote={() => handleUseRemote(c.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConflictCard({
  conflict,
  onKeepLocal,
  onUseRemote,
}: {
  conflict: SyncConflict;
  onKeepLocal: () => void;
  onUseRemote: () => void;
}) {
  const { t } = useTranslation();
  const diffs = computeDiffs(conflict.local, conflict.remote);

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-primary">
            {t(`conflicts.entity.${conflict.entity_type}`, {
              defaultValue: conflict.entity_type,
            })}
          </p>
          <p className="t-label text-[11px] truncate">
            {summarizeEntity(conflict)}
          </p>
        </div>
        <Pill tone="warning" className="shrink-0">
          {t("conflicts.diffCount", { count: diffs.length })}
        </Pill>
      </div>

      {diffs.length > 0 && (
        <ul className="space-y-2">
          {diffs.slice(0, 5).map((d) => (
            <li key={d.field} className="text-xs">
              <p className="t-label text-[11px] mb-1">{d.field}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border bg-surface-2 p-2">
                  <p className="t-label text-[10px] uppercase tracking-wide">
                    {t("conflicts.local")}
                  </p>
                  <p className="font-medium tabular-nums break-words">
                    {fmtValue(d.local)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-2 p-2">
                  <p className="t-label text-[10px] uppercase tracking-wide">
                    {t("conflicts.remote")}
                  </p>
                  <p className="font-medium tabular-nums break-words">
                    {fmtValue(d.remote)}
                  </p>
                </div>
              </div>
            </li>
          ))}
          {diffs.length > 5 && (
            <li className="t-label text-[11px]">
              {t("conflicts.moreDiffs", { count: diffs.length - 5 })}
            </li>
          )}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" onClick={onKeepLocal}>
          <span className="inline-flex items-center gap-1.5">
            <Check className="size-3.5" />
            {t("conflicts.keepLocal")}
          </span>
        </Button>
        <Button size="sm" variant="secondary" onClick={onUseRemote}>
          <span className="inline-flex items-center gap-1.5">
            <X className="size-3.5" />
            {t("conflicts.useRemote")}
          </span>
        </Button>
      </div>
    </Card>
  );
}

interface FieldDiff {
  field: string;
  local: unknown;
  remote: unknown;
}

function computeDiffs(
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
): FieldDiff[] {
  const out: FieldDiff[] = [];
  const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  // Skip noisy timestamps + sync metadata — the user cares about content.
  const skip = new Set([
    "created_at",
    "updated_at",
    "sheet_sync_status",
    "sheet_row_ref",
  ]);
  for (const k of allKeys) {
    if (skip.has(k)) continue;
    const a = local[k];
    const b = remote[k];
    if (!sameValue(a, b)) out.push({ field: k, local: a, remote: b });
  }
  return out;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  // SQLite returns 0/1 for booleans; reader returns true/false. Coerce.
  if (typeof a === "boolean" && typeof b === "number") return Number(a) === b;
  if (typeof a === "number" && typeof b === "boolean") return a === Number(b);
  return false;
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return String(v);
}

function summarizeEntity(c: SyncConflict): string {
  // Pick a useful identifying field from local (or remote if missing).
  const pick = (k: string) =>
    (c.local[k] as string | undefined) ?? (c.remote[k] as string | undefined);
  return (
    pick("description") ??
    pick("name") ??
    pick("merchant") ??
    c.entity_id
  );
}
