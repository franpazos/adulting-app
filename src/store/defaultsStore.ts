/**
 * User-configurable defaults used to pre-fill the Add Expense form.
 * Persisted to localStorage so the UX is sticky across sessions.
 *
 * Keep the surface narrow: the form has many fields, but only a few are
 * worth defaulting. Date is always today, description is always empty,
 * and category is best chosen per expense (so we don't default it).
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CashSource, OwnerType } from "@/lib/db/types";

interface DefaultsState {
  source: CashSource;
  owner: OwnerType;
  /** 0–100, applied when source is personal and owner is HOUSEHOLD. */
  splitFranPercent: number;
  setSource: (s: CashSource) => void;
  setOwner: (o: OwnerType) => void;
  setSplitFranPercent: (n: number) => void;
  reset: () => void;
}

const INITIAL: Pick<DefaultsState, "source" | "owner" | "splitFranPercent"> = {
  source: "JOINT",
  owner: "HOUSEHOLD",
  splitFranPercent: 50,
};

export const useDefaultsStore = create<DefaultsState>()(
  persist(
    (set) => ({
      ...INITIAL,
      setSource: (source) => set({ source }),
      setOwner: (owner) => set({ owner }),
      setSplitFranPercent: (splitFranPercent) =>
        set({ splitFranPercent: clamp(splitFranPercent) }),
      reset: () => set(INITIAL),
    }),
    {
      name: "adulting.defaults",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        source: s.source,
        owner: s.owner,
        splitFranPercent: s.splitFranPercent,
      }),
    },
  ),
);

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}
