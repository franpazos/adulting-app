import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type SyncPhase = "idle" | "pushing" | "pulling" | "success" | "error";

export interface SheetBinding {
  /** Google Spreadsheet ID. */
  id: string;
  /** Spreadsheet title at the time of binding (display only). */
  title: string;
}

interface SyncState {
  /** The spreadsheet the user has bound for sync, or null if not bound. */
  sheet: SheetBinding | null;
  /** True after the user explicitly disables auto-push. */
  manualOnly: boolean;
  phase: SyncPhase;
  lastPushAt: string | null;
  lastError: string | null;
  pendingChanges: number;
  setSheet: (s: SheetBinding | null) => void;
  setManualOnly: (v: boolean) => void;
  setPhase: (phase: SyncPhase) => void;
  setLastPushAt: (iso: string) => void;
  setError: (msg: string | null) => void;
  setPending: (n: number) => void;
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      sheet: null,
      manualOnly: false,
      phase: "idle",
      lastPushAt: null,
      lastError: null,
      pendingChanges: 0,
      setSheet: (s) => set({ sheet: s }),
      setManualOnly: (manualOnly) => set({ manualOnly }),
      setPhase: (phase) => set({ phase }),
      setLastPushAt: (lastPushAt) => set({ lastPushAt }),
      setError: (lastError) => set({ lastError }),
      setPending: (pendingChanges) => set({ pendingChanges }),
    }),
    {
      name: "adulting.sync",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        sheet: s.sheet,
        manualOnly: s.manualOnly,
        lastPushAt: s.lastPushAt,
      }),
    },
  ),
);
