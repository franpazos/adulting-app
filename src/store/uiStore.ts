import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  clampMonthKey,
  currentMonthKey,
  type MonthKey,
} from "@/lib/date/month";

export type Scope = "household" | "fran" | "sam" | "all";

interface UiState {
  monthKey: MonthKey;
  scope: Scope;
  setMonthKey: (m: MonthKey) => void;
  setScope: (s: Scope) => void;
}

/**
 * Cross-page session state: which month is the user looking at, and which
 * scope (Household / Fran / Sam / All) is selected on the dashboard.
 *
 * Persisted to localStorage so navigating away and back keeps context.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      monthKey: clampMonthKey(currentMonthKey()),
      scope: "household",
      // Clamp so nothing (arrows, a jump after saving a back-dated tx, a stale
      // persisted value) can put the view before the app's start month.
      setMonthKey: (m) => set({ monthKey: clampMonthKey(m) }),
      setScope: (s) => set({ scope: s }),
    }),
    {
      name: "adulting.ui",
      partialize: (state) => ({
        monthKey: state.monthKey,
        scope: state.scope,
      }),
      // A value persisted before the floor existed could be pre-May; clamp it
      // on rehydrate so the app never boots into a now-forbidden month.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UiState>;
        return {
          ...current,
          ...p,
          monthKey: clampMonthKey(p.monthKey ?? current.monthKey),
        };
      },
    },
  ),
);
