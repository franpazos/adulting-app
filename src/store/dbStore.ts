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
  setInitializing: () => void;
  setReady: (info: {
    backend: Backend;
    warning: string | null;
    seeded: boolean;
  }) => void;
  setError: (msg: string) => void;
}

export const useDbStore = create<DbState>((set) => ({
  status: "idle",
  backend: null,
  warning: null,
  error: null,
  seededOnThisLoad: false,
  setInitializing: () =>
    set({ status: "initializing", error: null, warning: null }),
  setReady: ({ backend, warning, seeded }) =>
    set({
      status: "ready",
      backend,
      warning,
      error: null,
      seededOnThisLoad: seeded,
    }),
  setError: (msg) => set({ status: "error", error: msg }),
}));
