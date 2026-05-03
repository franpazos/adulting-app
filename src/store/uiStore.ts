import { create } from "zustand";
import { persist } from "zustand/middleware";
import { currentMonthKey, type MonthKey } from "@/lib/date/month";

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
      monthKey: currentMonthKey(),
      scope: "household",
      setMonthKey: (m) => set({ monthKey: m }),
      setScope: (s) => set({ scope: s }),
    }),
    {
      name: "adulting.ui",
      partialize: (state) => ({
        monthKey: state.monthKey,
        scope: state.scope,
      }),
    },
  ),
);
