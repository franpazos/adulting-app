/**
 * Auto-sync coordinator.
 *
 * Runs in the app shell and triggers `syncAll` automatically when:
 *   1. **Boot:** the app loads with sync connected. Always sync if there
 *      are any PENDING items in the sync_queue; otherwise only sync if
 *      ≥60s elapsed since `lastPushAt`. The pending-queue check is the
 *      source of truth — it survives reloads, background suspension, and
 *      iOS timer death, so a write that didn't push earlier always
 *      catches up on the next app open.
 *   2. **On focus:** every `visibilitychange → visible` triggers a sync.
 *      This is the snappy path — open the app, get fresh data
 *      immediately, no 60s wait.
 *   3. **Local writes:** `dbVersion` bumps schedule a 3s-debounced sync
 *      so a flurry of edits coalesces into one push.
 *   4. **Coming back online:** if there are unsynced writes, sync.
 *
 * Manual "Sync now" from `SyncCard` continues to work in parallel — both
 * paths route through the shared `syncStore.phase` so the UI shows the
 * single source of truth.
 *
 * Skips silently when:
 *   - DB isn't ready
 *   - User is offline
 *   - Auth isn't connected (no token, or expired)
 *   - No sheet is bound
 *   - A sync is already in flight (`phase === "pulling" | "pushing"`)
 *   - The user explicitly chose `manualOnly`
 */

import { useEffect, useRef } from "react";
import { useAuthStore, hasValidToken } from "@/store/authStore";
import { useSyncStore } from "@/store/syncStore";
import { useDbStore } from "@/store/dbStore";
import { useNetworkStore } from "@/store/networkStore";
import { listPending } from "./queue";
import { syncAll } from "./sync";

const DEBOUNCE_MS = 3000;
const BOOT_MIN_GAP_MS = 60_000;

export function useAutoSync(): void {
  const dbReady = useDbStore((s) => s.status === "ready");
  const dbVersion = useDbStore((s) => s.dbVersion);
  const bumpDbVersion = useDbStore((s) => s.bumpVersion);

  const online = useNetworkStore((s) => s.online);

  const token = useAuthStore((s) => s.token);

  const sheet = useSyncStore((s) => s.sheet);
  const manualOnly = useSyncStore((s) => s.manualOnly);
  const phase = useSyncStore((s) => s.phase);
  const setPhase = useSyncStore((s) => s.setPhase);
  const setLastPushAt = useSyncStore((s) => s.setLastPushAt);
  const setError = useSyncStore((s) => s.setError);
  const lastPushAt = useSyncStore((s) => s.lastPushAt);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootedRef = useRef(false);
  const inFlightRef = useRef(false);

  const canSync =
    dbReady && online && hasValidToken(token) && !!sheet && !manualOnly;

  async function runSync(_reason: string): Promise<void> {
    if (!sheet) return;
    if (inFlightRef.current) return;
    if (phase === "pulling" || phase === "pushing") return;
    inFlightRef.current = true;

    setPhase("pushing");
    setError(null);
    try {
      const report = await syncAll(sheet.id);
      if (report.pullError) {
        // Pull failed → push was aborted. Surface as error.
        setError(report.pullError);
        setPhase("error");
      } else if (report.pushError) {
        setError(report.pushError);
        setPhase("error");
      } else {
        setLastPushAt(new Date().toISOString());
        setPhase("success");
      }

      // If pull pulled in any new/updated row, bump dbVersion so dependent
      // pages re-derive. Don't bump on no-op syncs.
      if (report.pull) {
        const totalChanges =
          sumValues(report.pull.inserted) + sumValues(report.pull.updated);
        if (totalChanges > 0) {
          bumpDbVersion();
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPhase("error");
    } finally {
      inFlightRef.current = false;
    }
  }

  /** True if the sync_queue has any rows that haven't been pushed yet. */
  function hasPendingWrites(): boolean {
    try {
      return listPending().length > 0;
    } catch {
      return false;
    }
  }

  // 1. On-boot sync. Always runs if there are pending writes; otherwise
  //    gated by the 60s last-push window.
  useEffect(() => {
    if (!canSync) return;
    if (bootedRef.current) return;
    bootedRef.current = true;

    const lastMs = lastPushAt ? Date.parse(lastPushAt) : 0;
    const stale = !lastMs || Date.now() - lastMs >= BOOT_MIN_GAP_MS;
    if (!stale && !hasPendingWrites()) return;
    void runSync("boot");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSync]);

  // 2. Sync when the page becomes visible. Catches: returning from
  //    background, unlocking phone, switching back to the tab.
  useEffect(() => {
    if (!canSync) return;
    if (typeof document === "undefined") return;

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // Always pull on focus so the other device's writes show up; only
      // skip if a sync is in flight or we just synced (debounced by phase).
      if (inFlightRef.current) return;
      if (phase === "pulling" || phase === "pushing") return;
      void runSync("visible");
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSync, phase]);

  // 3. Debounced sync on local writes.
  useEffect(() => {
    if (!canSync) return;
    if (!bootedRef.current) return;
    if (!hasPendingWrites()) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSync("write");
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbVersion, canSync]);

  // 4. Re-sync when the browser comes back online (if there are unsynced writes).
  useEffect(() => {
    if (!online) return;
    if (!canSync) return;
    if (!hasPendingWrites()) return;
    void runSync("online");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);
}

function sumValues(map: Record<string, number>): number {
  return Object.values(map).reduce((acc, n) => acc + n, 0);
}
