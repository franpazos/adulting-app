/**
 * Auto-sync coordinator.
 *
 * Runs in the app shell and triggers `syncAll` automatically when:
 *   1. The app boots with a connected Google account + bound sheet, and
 *      we haven't pushed for at least 60s.
 *   2. A local DB write happens (`dbVersion` bumps), debounced by 3s so
 *      bursts of edits coalesce into one push.
 *   3. The browser comes back online after being offline.
 *
 * Manual "Push now" from `SyncCard` continues to work in parallel — both
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
  /** Snapshot of dbVersion at the last completed sync; -1 means never. */
  const syncedVersionRef = useRef(-1);

  const canSync =
    dbReady && online && hasValidToken(token) && !!sheet && !manualOnly;

  async function runSync(reason: "boot" | "write" | "online"): Promise<void> {
    if (!sheet) return;
    if (inFlightRef.current) return;
    if (phase === "pulling" || phase === "pushing") return;
    inFlightRef.current = true;

    const startedAtVersion = useDbStore.getState().dbVersion;

    setPhase("pushing");
    setError(null);
    try {
      const report = await syncAll(sheet.id);
      if (report.pushError) {
        setError(report.pushError);
        setPhase("error");
      } else if (report.pullError) {
        // Push succeeded but pull failed — still a partial success.
        setError(report.pullError);
        setLastPushAt(new Date().toISOString());
        setPhase("success");
      } else {
        setLastPushAt(new Date().toISOString());
        setPhase("success");
      }

      // If pull pulled in any new/updated row, bump dbVersion so dependent
      // pages re-derive. Don't bump on no-op syncs.
      if (report.pull) {
        const totalChanges = sumValues(report.pull.inserted) + sumValues(report.pull.updated);
        if (totalChanges > 0) {
          bumpDbVersion();
        }
      }
      syncedVersionRef.current = startedAtVersion;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPhase("error");
    } finally {
      inFlightRef.current = false;
      void reason; // used only for clarity / future telemetry
    }
  }

  // 1. On-boot sync, once per app load.
  useEffect(() => {
    if (!canSync) return;
    if (bootedRef.current) return;
    bootedRef.current = true;

    const lastMs = lastPushAt ? Date.parse(lastPushAt) : 0;
    const stale = !lastMs || Date.now() - lastMs >= BOOT_MIN_GAP_MS;
    if (!stale) {
      // Still mark synced version baseline so the write debouncer doesn't
      // fire spuriously on the first dbVersion bump.
      syncedVersionRef.current = useDbStore.getState().dbVersion;
      return;
    }
    void runSync("boot");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSync]);

  // 2. Debounced sync on local writes.
  useEffect(() => {
    if (!canSync) return;
    if (!bootedRef.current) return; // wait for boot sync to set baseline
    if (dbVersion === syncedVersionRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSync("write");
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbVersion, canSync]);

  // 3. Re-sync when the browser comes back online (if there are unsynced writes).
  useEffect(() => {
    if (!online) return;
    if (!canSync) return;
    if (!bootedRef.current) return;
    if (dbVersion === syncedVersionRef.current) return;
    void runSync("online");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);
}

function sumValues(map: Record<string, number>): number {
  return Object.values(map).reduce((acc, n) => acc + n, 0);
}
