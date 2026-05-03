import { create } from "zustand";

type Status = "idle" | "initializing" | "ready" | "error";
type Backend = "opfs-sahpool" | "memory";

interface DbState {
  status: Status;
  backend: Backend | null;
  /** Non-blocking warning surfaced by the init layer (e.g. OPFS fallback). */
  warning: string | null;
  error: string | null;
  /** True the very first time we seeded the DB this session. */
  seededOnThisLoad: boolean;
  /**
   * Monotonically incremented every time something writes to the DB.
   * Components that read derived data (e.g. Home) include this in their
   * `useMemo` dependencies so they re-fetch after a save.
   */
  dbVersion: number;
  setInitializing: () => void;
  setReady: (info: {
    backend: Backend;
    warning: string | null;
    seeded: boolean;
  }) => void;
  setError: (msg: string) => void;
  bumpVersion: () => void;
}

export const useDbStore = create<DbState>((set) => ({
  status: "idle",
  backend: null,
  warning: null,
  error: null,
  seededOnThisLoad: false,
  dbVersion: 0,
  setInitializing: () =>
    set({ status: "initializing", error: null, warning: null }),
  setReady: ({ backend, warning, seeded }) =>
    set({
      status: "ready",
      backend,
      warning,
      error: null,
      seededOnThisLoad: seeded,
      // Bump on initial load so any pre-mounted readers refresh.
      dbVersion: 1,
    }),
  setError: (msg) => set({ status: "error", error: msg }),
  bumpVersion: () => set((s) => ({ dbVersion: s.dbVersion + 1 })),
}));
