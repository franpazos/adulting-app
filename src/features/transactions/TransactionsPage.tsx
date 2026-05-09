import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ListChecks, Search, SlidersHorizontal, X } from "lucide-react";

import {
  Button,
  EmptyState,
  IconButton,
  Input,
  Pill,
  SegmentedControl,
  type SegmentedOption,
} from "@/components/ui";
import { EmptyArt } from "@/components/EmptyArt";
import { AppHeader } from "@/components/AppHeader";
import { TransactionRow } from "./TransactionRow";

import { categoriesRepo, transactionsRepo } from "@/lib/db";
import { useUiStore } from "@/store/uiStore";
import { useDbStore } from "@/store/dbStore";
import { formatMonthLabel } from "@/lib/date/month";
import { accountIdToCashSource } from "@/features/add-expense/sources";
import type { CashSource, OwnerType, Transaction } from "@/lib/db/types";

type SourceFilter = "ALL" | CashSource;
type OwnerFilter = "ALL" | OwnerType;
type FlagFilter = "ALL" | "SHARED" | "RECURRING" | "DEBT";

interface FilterState {
  source: SourceFilter;
  owner: OwnerFilter;
  flag: FlagFilter;
  categoryId: string | "ALL";
  query: string;
}

const INITIAL: FilterState = {
  source: "ALL",
  owner: "ALL",
  flag: "ALL",
  categoryId: "ALL",
  query: "",
};

export function TransactionsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("es") ? "es" : "en";
  const dbReady = useDbStore((s) => s.status === "ready");
  const dbVersion = useDbStore((s) => s.dbVersion);
  const monthKey = useUiStore((s) => s.monthKey);

  const [filters, setFilters] = useState<FilterState>(INITIAL);
  const [showFilters, setShowFilters] = useState(false);

  const allTxs = useMemo(
    () => (dbReady ? transactionsRepo.listByMonth(monthKey) : []),
    [dbReady, dbVersion, monthKey],
  );

  // Per-tx allocation summary in one pass — used both for the "shared" pill
  // and for the owner filter.
  const allocationOwners = useMemo(() => {
    const map = new Map<string, OwnerType[]>();
    if (!dbReady) return map;
    for (const tx of allTxs) {
      const allocs = transactionsRepo.allocationsFor(tx.id);
      map.set(
        tx.id,
        allocs.map((a) => a.owner_type),
      );
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbReady, dbVersion, allTxs]);

  const categories = useMemo(
    () => (dbReady ? categoriesRepo.list() : []),
    [dbReady, dbVersion],
  );

  const filtered = useMemo(
    () => applyFilters(allTxs, filters, allocationOwners),
    [allTxs, filters, allocationOwners],
  );

  const filterCount = countActiveFilters(filters);
  const hasFilters = filterCount > 0;

  if (allTxs.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-5">
        <AppHeader />
        <EmptyState
          variant="centered"
          art={<EmptyArt kind="transactions" />}
          title={t("transactions.empty.title")}
          description={t("transactions.empty.description")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-5">
      <AppHeader />

      <div className="flex items-baseline justify-between">
        <h1 className="h-display">{t("transactions.title")}</h1>
        <span className="t-label">
          {formatMonthLabel(monthKey, lang as "en" | "es")}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <Input
            value={filters.query}
            onChange={(e) =>
              setFilters((f) => ({ ...f, query: e.target.value }))
            }
            placeholder={t("transactions.searchPlaceholder")}
            className="pl-9"
            aria-label={t("transactions.searchPlaceholder")}
          />
        </div>
        <IconButton
          aria-label={t("transactions.filters.toggle")}
          variant={showFilters || hasFilters ? "violet" : "surface"}
          size="md"
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal className="size-4" />
          {hasFilters && (
            <span className="absolute -top-1 -right-1 grid place-items-center min-w-4 h-4 px-1 rounded-full bg-expense text-white text-[10px] font-bold">
              {filterCount}
            </span>
          )}
        </IconButton>
      </div>

      {showFilters && (
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          categories={categories}
        />
      )}

      <div className="flex items-center justify-between text-text-secondary">
        <div className="flex items-center gap-2">
          <ListChecks className="size-4" />
          <span className="t-label">
            {hasFilters
              ? t("transactions.filteredCount", {
                  shown: filtered.length,
                  total: allTxs.length,
                })
              : t("transactions.count", { count: allTxs.length })}
          </span>
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters(INITIAL)}
          >
            <span className="inline-flex items-center gap-1.5 text-xs">
              <X className="size-3.5" />
              {t("transactions.filters.clear")}
            </span>
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          variant="centered"
          art={<EmptyArt kind="transactions" />}
          title={t("transactions.filters.emptyTitle")}
          description={t("transactions.filters.emptyDescription")}
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((tx) => (
            <li key={tx.id}>
              <TransactionRow
                tx={tx}
                shared={(allocationOwners.get(tx.id)?.length ?? 0) > 1}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter panel
// ─────────────────────────────────────────────────────────────────────────────

function FilterPanel({
  filters,
  onChange,
  categories,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  categories: ReturnType<typeof categoriesRepo.list>;
}) {
  const { t } = useTranslation();

  const sourceOptions: ReadonlyArray<SegmentedOption<SourceFilter>> = [
    { value: "ALL", label: t("transactions.filters.all") },
    { value: "FRAN_PERSONAL", label: t("addExpense.who.fran") },
    { value: "SAM_PERSONAL", label: t("addExpense.who.sam") },
    { value: "JOINT", label: t("addExpense.who.joint") },
  ];
  const ownerOptions: ReadonlyArray<SegmentedOption<OwnerFilter>> = [
    { value: "ALL", label: t("transactions.filters.all") },
    { value: "FRAN", label: t("addExpense.who.fran") },
    { value: "SAM", label: t("addExpense.who.sam") },
    { value: "HOUSEHOLD", label: t("addExpense.who.household") },
  ];
  const flagOptions: ReadonlyArray<SegmentedOption<FlagFilter>> = [
    { value: "ALL", label: t("transactions.filters.all") },
    { value: "SHARED", label: t("transactions.filters.flag.shared") },
    { value: "RECURRING", label: t("transactions.filters.flag.recurring") },
    { value: "DEBT", label: t("transactions.filters.flag.debt") },
  ];

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-3 shadow-card">
      <FilterRow label={t("transactions.filters.source")}>
        <SegmentedControl
          options={sourceOptions}
          value={filters.source}
          onChange={(v) => onChange({ ...filters, source: v })}
          tone="surface"
          className="w-full justify-stretch [&>button]:flex-1"
        />
      </FilterRow>

      <FilterRow label={t("transactions.filters.owner")}>
        <SegmentedControl
          options={ownerOptions}
          value={filters.owner}
          onChange={(v) => onChange({ ...filters, owner: v })}
          tone="surface"
          className="w-full justify-stretch [&>button]:flex-1"
        />
      </FilterRow>

      <FilterRow label={t("transactions.filters.flag.label")}>
        <SegmentedControl
          options={flagOptions}
          value={filters.flag}
          onChange={(v) => onChange({ ...filters, flag: v })}
          tone="surface"
          className="w-full justify-stretch [&>button]:flex-1"
        />
      </FilterRow>

      <FilterRow label={t("transactions.filters.category")}>
        <div className="flex flex-wrap gap-1.5">
          <CategoryChip
            label={t("transactions.filters.all")}
            active={filters.categoryId === "ALL"}
            onClick={() => onChange({ ...filters, categoryId: "ALL" })}
          />
          {categories.map((c) => (
            <CategoryChip
              key={c.id}
              label={c.name}
              dot={c.color ?? undefined}
              active={filters.categoryId === c.id}
              onClick={() =>
                onChange({
                  ...filters,
                  categoryId: filters.categoryId === c.id ? "ALL" : c.id,
                })
              }
            />
          ))}
        </div>
      </FilterRow>
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="t-label text-[11px] uppercase tracking-wide">{label}</p>
      {children}
    </div>
  );
}

function CategoryChip({
  label,
  dot,
  active,
  onClick,
}: {
  label: string;
  dot?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors " +
        (active
          ? "bg-violet text-white border-violet"
          : "bg-surface text-text-secondary border-border hover:text-text-primary")
      }
    >
      {dot && (
        <span
          className="size-2 rounded-full"
          style={{ background: active ? "rgb(255 255 255 / 0.85)" : dot }}
        />
      )}
      {label}
    </button>
  );
}

// Re-export Pill so the unused-import linter doesn't fire on the Pill we
// might want here later. Suppress with a void.
void Pill;

// ─────────────────────────────────────────────────────────────────────────────
// Filtering logic
// ─────────────────────────────────────────────────────────────────────────────

function applyFilters(
  txs: Transaction[],
  f: FilterState,
  allocationOwners: Map<string, OwnerType[]>,
): Transaction[] {
  const q = f.query.trim().toLowerCase();
  return txs.filter((tx) => {
    if (f.source !== "ALL") {
      try {
        if (accountIdToCashSource(tx.source_account_id) !== f.source) {
          return false;
        }
      } catch {
        // Unknown account id — exclude under any specific filter.
        return false;
      }
    }

    if (f.owner !== "ALL") {
      const owners = allocationOwners.get(tx.id) ?? [];
      if (!owners.includes(f.owner)) return false;
    }

    if (f.categoryId !== "ALL" && tx.category_id !== f.categoryId) {
      return false;
    }

    if (f.flag === "SHARED") {
      const owners = allocationOwners.get(tx.id) ?? [];
      if (owners.length <= 1) return false;
    } else if (f.flag === "RECURRING") {
      if (tx.origin !== "RECURRING_GENERATED") return false;
    } else if (f.flag === "DEBT") {
      if (tx.type !== "DEBT_PAYMENT") return false;
    }

    if (q) {
      const haystack = `${tx.description ?? ""} ${tx.merchant ?? ""} ${
        tx.notes ?? ""
      }`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

function countActiveFilters(f: FilterState): number {
  let n = 0;
  if (f.source !== "ALL") n++;
  if (f.owner !== "ALL") n++;
  if (f.flag !== "ALL") n++;
  if (f.categoryId !== "ALL") n++;
  if (f.query.trim().length > 0) n++;
  return n;
}
