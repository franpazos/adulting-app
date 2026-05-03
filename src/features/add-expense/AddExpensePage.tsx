/**
 * Add Expense — Variation B (Flow diagram).
 *
 * The signature flow of the app. Lives at `/add` and is reachable from the
 * elevated central + button in the bottom nav. Saves to the local SQLite
 * via `transactionsRepo.create` + `recomputeForTransaction`, then bumps
 * `dbStore.dbVersion` so Home re-fetches.
 *
 * Visual reference: docs/design-handoff/scripts/add-expense.jsx (`AddExpenseB`).
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import {
  Card,
  CardEyebrow,
  Input,
  Slider,
  IconButton,
} from "@/components/ui";
import { SegmentedControl, type SegmentedOption } from "@/components/ui";
import { FlowDiagram } from "@/components/FlowDiagram";
import { SettlementChip } from "@/components/SettlementChip";
import { ConsequenceSentence } from "@/components/ConsequenceSentence";

import {
  expenseAllocator,
  recomputeForTransaction,
} from "@/lib/calculations";
import {
  categoriesRepo,
  transactionsRepo,
  SEED_IDS,
} from "@/lib/db";
import type { CashSource, OwnerType, Category } from "@/lib/db/types";
import { useDbStore } from "@/store/dbStore";
import { useUiStore } from "@/store/uiStore";
import { cn } from "@/lib/utils/cn";

const SOURCE_TO_ACCOUNT: Record<CashSource, string> = {
  FRAN_PERSONAL: SEED_IDS.accounts.franPersonal,
  SAM_PERSONAL: SEED_IDS.accounts.samPersonal,
  JOINT: SEED_IDS.accounts.joint,
};

const SOURCE_TO_USER: Record<CashSource, string | null> = {
  FRAN_PERSONAL: SEED_IDS.users.fran,
  SAM_PERSONAL: SEED_IDS.users.sam,
  JOINT: null,
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AddExpensePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dbReady = useDbStore((s) => s.status === "ready");
  const bumpVersion = useDbStore((s) => s.bumpVersion);
  const setMonthKey = useUiStore((s) => s.setMonthKey);

  // Form state — sensible defaults (Sam paying joint household groceries
  // is the modal case from the spec; in real use we could remember last
  // entry as a Phase 7 polish).
  const [amountText, setAmountText] = useState("");
  const [source, setSource] = useState<CashSource>("JOINT");
  const [owner, setOwner] = useState<OwnerType>("HOUSEHOLD");
  const [splitFranPercent, setSplitFranPercent] = useState(50);
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const amount = parseAmount(amountText);

  // Live consequence preview
  const allocation = useMemo(
    () =>
      expenseAllocator({
        amount,
        source,
        owner,
        splitFranPercent,
      }),
    [amount, source, owner, splitFranPercent],
  );
  const settlement = allocation.settlements[0] ?? null;

  const isShared = owner === "HOUSEHOLD" && source !== "JOINT";

  // Categories for the picker
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    if (dbReady) setCategories(categoriesRepo.list("EXPENSE"));
  }, [dbReady]);

  const sourceOptions: ReadonlyArray<SegmentedOption<CashSource>> = [
    { value: "FRAN_PERSONAL", label: t("addExpense.who.fran") },
    { value: "SAM_PERSONAL", label: t("addExpense.who.sam") },
    { value: "JOINT", label: t("addExpense.who.joint") },
  ];
  const ownerOptions: ReadonlyArray<SegmentedOption<OwnerType>> = [
    { value: "FRAN", label: t("addExpense.who.fran") },
    { value: "SAM", label: t("addExpense.who.sam") },
    { value: "HOUSEHOLD", label: t("addExpense.who.household") },
  ];

  function handleSave() {
    if (!dbReady || amount <= 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const tx = transactionsRepo.create({
        type: "EXPENSE",
        date,
        amount,
        currency_code: "EUR",
        source_account_id: SOURCE_TO_ACCOUNT[source],
        description: description.trim() || null,
        category_id: categoryId,
        created_by_user_id: SOURCE_TO_USER[source],
        origin: "MANUAL",
        sheet_sync_status: "PENDING",
        allocations: allocation.allocations,
      });
      recomputeForTransaction(tx.id);
      bumpVersion();
      // Navigate to the month the tx falls in, then back to Home.
      setMonthKey(tx.month_key);
      navigate("/");
    } catch (err) {
      console.error("[add-expense] save failed", err);
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-32">
      {/* Top nav */}
      <div className="flex items-center justify-between pt-4 pb-2">
        <IconButton
          aria-label={t("common.cancel")}
          onClick={() => navigate(-1)}
        >
          <X className="size-5" />
        </IconButton>
        <h1 className="font-display text-base font-semibold">
          {t("addExpense.title")}
        </h1>
        <span className="size-10" aria-hidden />
      </div>

      {/* Amount + flow card */}
      <Card className="bg-gradient-to-b from-surface to-surface-2 px-5 py-5 space-y-2">
        <div className="text-center">
          <p className="t-eyebrow">{t("addExpense.amount")}</p>
          <div className="mt-1 flex items-baseline justify-center">
            <span className="font-display text-3xl font-medium text-text-muted self-start mt-2">
              €
            </span>
            <input
              autoFocus
              inputMode="decimal"
              type="text"
              placeholder="0,00"
              value={amountText}
              onChange={(e) => setAmountText(sanitizeAmount(e.target.value))}
              className={cn(
                "bg-transparent border-0 outline-none text-center",
                "font-display text-5xl font-semibold tabular-nums tracking-tight",
                "text-text-primary placeholder:text-text-muted",
                "w-[min(70%,260px)]",
              )}
            />
          </div>
        </div>

        <FlowDiagram source={source} owner={owner} />

        <div className="flex justify-center">
          <SettlementChip settlement={settlement} />
        </div>
      </Card>

      {/* Paid from */}
      <Section label={t("addExpense.paidFrom")}>
        <SegmentedControl
          options={sourceOptions}
          value={source}
          onChange={setSource}
          className="w-full justify-stretch [&>button]:flex-1"
          ariaLabel={t("addExpense.paidFrom")}
        />
      </Section>

      {/* Belongs to */}
      <Section label={t("addExpense.belongsTo")}>
        <SegmentedControl
          options={ownerOptions}
          value={owner}
          onChange={setOwner}
          className="w-full justify-stretch [&>button]:flex-1"
          ariaLabel={t("addExpense.belongsTo")}
        />
      </Section>

      {/* Split — only relevant when shared with a personal source */}
      {isShared && (
        <Section
          label={t("addExpense.splitLabel", {
            fran: splitFranPercent,
            sam: 100 - splitFranPercent,
          })}
        >
          <Slider
            value={splitFranPercent}
            onValueChange={setSplitFranPercent}
            ariaLabel={t("addExpense.split")}
          />
        </Section>
      )}

      {/* Category */}
      <Section label={t("addExpense.category")}>
        <CategoryPicker
          categories={categories}
          value={categoryId}
          onChange={setCategoryId}
        />
      </Section>

      {/* Description + date */}
      <Section label={t("addExpense.description")}>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("addExpense.descriptionPlaceholder")}
        />
      </Section>

      <Section label={t("addExpense.date")}>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Section>

      {/* What happens — readable mirror of the chip */}
      <div className="mt-5">
        <Card variant="accent" className="space-y-2">
          <CardEyebrow>{t("addExpense.title")}</CardEyebrow>
          <p className="text-sm leading-relaxed text-text-secondary">
            <ConsequenceSentence
              amount={amount}
              source={source}
              owner={owner}
              settlement={settlement}
            />
          </p>
        </Card>
      </div>

      {saveError && (
        <p className="mt-3 text-sm text-expense" role="alert">
          {saveError}
        </p>
      )}

      {/* Sticky save FAB */}
      <SaveFab
        amount={amount}
        disabled={amount <= 0 || saving}
        loading={saving}
        onClick={handleSave}
      />
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 space-y-2">
      <CardEyebrow>{label}</CardEyebrow>
      {children}
    </section>
  );
}

function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <CategoryChip
        active={value === null}
        onClick={() => onChange(null)}
        color={null}
        label="—"
      />
      {categories.map((c) => (
        <CategoryChip
          key={c.id}
          active={value === c.id}
          onClick={() => onChange(c.id)}
          color={c.color}
          label={c.name}
        />
      ))}
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  color,
  label,
}: {
  active: boolean;
  onClick: () => void;
  color: string | null;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-3 h-9 rounded-full whitespace-nowrap",
        "text-sm font-medium border transition-colors",
        active
          ? "bg-violet text-white border-transparent shadow-violet-glow"
          : "bg-surface text-text-secondary border-border hover:bg-surface-2",
      )}
    >
      {color && (
        <span
          className="size-2 rounded-full"
          style={{ background: color }}
        />
      )}
      {label}
    </button>
  );
}

function SaveFab({
  amount,
  disabled,
  loading,
  onClick,
}: {
  amount: number;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 pointer-events-none">
      <div className="mx-auto max-w-md px-4 pb-safe-bottom pb-4 pointer-events-auto">
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          className={cn(
            "w-full h-14 rounded-2xl text-white font-display font-semibold",
            "flex items-center justify-center gap-2",
            "shadow-violet-glow transition-[opacity,transform]",
            "active:scale-[0.99]",
            "bg-gradient-to-br from-violet-soft via-violet to-violet-ink",
            disabled && "opacity-60 cursor-not-allowed",
          )}
        >
          {loading
            ? t("addExpense.saving")
            : t("addExpense.saveLabel", {
                amount: formatEUR(amount),
              })}
        </button>
      </div>
    </div>
  );
}

function parseAmount(text: string): number {
  if (!text) return 0;
  const normalized = text.replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function sanitizeAmount(text: string): string {
  // Allow digits, one decimal separator (',' or '.'), strip everything else.
  let out = text.replace(/[^\d,.]/g, "");
  // Collapse multiple separators to the first.
  const firstSep = out.search(/[,.]/);
  if (firstSep !== -1) {
    out =
      out.slice(0, firstSep + 1) + out.slice(firstSep + 1).replace(/[,.]/g, "");
  }
  return out;
}

function formatEUR(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}
