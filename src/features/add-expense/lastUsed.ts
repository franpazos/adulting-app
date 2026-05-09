/**
 * Per-pattern memory of the last category used in Add Expense, so a user
 * who consistently logs "groceries from Sam personal → Household 50/50"
 * doesn't re-pick the category every time.
 *
 * The pattern key is `source|owner|splitFranPercent`. On save we store
 * the category id; on form open we look up the matching pattern and
 * pre-fill if found. The user's static `defaultsStore` choice still
 * wins for source/owner/split — this only fills in `categoryId`.
 *
 * Stored as a single localStorage JSON object keyed by pattern. Keeps
 * grow bounded (≤ 9 source × 3 owner × ~5 split = ~135 entries max).
 */

import type { CashSource, OwnerType } from "@/lib/db/types";

const STORAGE_KEY = "adulting.lastUsed.v1";

interface PatternMemory {
  categoryId: string | null;
}

type Memory = Record<string, PatternMemory>;

export function buildPatternKey(
  source: CashSource,
  owner: OwnerType,
  splitFranPercent: number,
): string {
  return `${source}|${owner}|${splitFranPercent}`;
}

function load(): Memory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Memory;
  } catch {
    return {};
  }
}

function save(mem: Memory): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mem));
  } catch {
    // Quota or private mode — silently drop the memory; it's a nice-to-have.
  }
}

export function recordLastUsed(
  pattern: string,
  memory: PatternMemory,
): void {
  if (memory.categoryId === null) return; // don't pollute with empty patterns
  const all = load();
  all[pattern] = memory;
  save(all);
}

export function lookupLastUsed(pattern: string): PatternMemory | null {
  const all = load();
  return all[pattern] ?? null;
}
