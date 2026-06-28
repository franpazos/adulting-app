/**
 * Shared expense form used by both Add (`AddExpensePage`) and Edit
 * (`EditExpensePage`). Encapsulates the entire "amount + flow + segmented
 * + slider + category + date + description + live preview" block so the
 * pages only differ in title, save behavior, and the optional Delete
 * button (edit-only).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Calendar } from "lucide-react";

import {
  Card,
  CardEyebrow,
  Input,
  Slider,
  SegmentedControl,
  type SegmentedOption,
} from "@/components/ui";
import { FlowDiagram } from "@/components/FlowDiagram";
import { SettlementChip } from "@/components/SettlementChip";

import { expenseAllocator } from "@/lib/calculations";
import { categoriesRepo } from "@/lib/db";
import type { CashSource, OwnerType, Category } from "@/lib/db/types";

/**
 * Transaction type for the polymorphic /add flow. EXPENSE, INCOME and
 * TRANSFER all render through this form. DEBT_PAYMENT lives in
 * /debts/:id/pay because of FX semantics.
 */
export type TxFormType = "EXPENSE" | "INCOME" | "TRANSFER";

/** Returns the invalid-pair reason, or null when the from→to combo is allowed. */
export function transferValidationError(
  from: CashSource,
  to: CashSource,
): "same" | "personal_to_personal" | null {
  if (from === to) return "same";
  // Fran personal ↔ Sam personal: blocked. SettleUp is the right tool
  // for clearing internal debt between Fran and Sam (the TRANSFER would
  // move cash but bypass the settlement_ledger flow).
  if (from === "FRAN_PERSONAL" && to === "SAM_PERSONAL")
    return "personal_to_personal";
  if (from === "SAM_PERSONAL" && to === "FRAN_PERSONAL")
    return "personal_to_personal";
  return null;
}
import { useDbStore } from "@/store/dbStore";
import { cn } from "@/lib/utils/cn";
import {
  parseAmount as parseAmountFmt,
  sanitizeAmountInput,
  formatAmountForInput as formatAmountForInputFmt,
} from "@/lib/utils/format";

// Re-export so existing callers (AddExpensePage, EditExpensePage) keep
// importing from this module unchanged.
export const parseAmount = parseAmountFmt;
export const formatAmountForInput = formatAmountForInputFmt;

export interface TransactionFormValues {
  type: TxFormType;
  amountText: string;
  source: CashSource;
  /** Only meaningful when type='TRANSFER'. */
  destination: CashSource;
  owner: OwnerType;
  splitFranPercent: number;
  date: string;
  description: string;
  categoryId: string | null;
}

interface TransactionFormProps {
  values: TransactionFormValues;
  onChange: (next: TransactionFormValues) => void;
}

export function defaultFormValues(): TransactionFormValues {
  return {
    type: "EXPENSE",
    amountText: "",
    source: "JOINT",
    destination: "JOINT",
    owner: "HOUSEHOLD",
    splitFranPercent: 50,
    date: new Date().toISOString().slice(0, 10),
    description: "",
    categoryId: null,
  };
}

export function TransactionForm({ values, onChange }: TransactionFormProps) {
  const { t } = useTranslation();
  const dbReady = useDbStore((s) => s.status === "ready");

  const isIncome = values.type === "INCOME";
  const isTransfer = values.type === "TRANSFER";

  const amount = parseAmount(values.amountText);
  const allocation = useMemo(
    () =>
      expenseAllocator({
        amount,
        source: values.source,
        owner: values.owner,
        splitFranPercent: values.splitFranPercent,
      }),
    [amount, values.source, values.owner, values.splitFranPercent],
  );
  const settlement = allocation.settlements[0] ?? null;
  const isShared =
    !isIncome &&
    !isTransfer &&
    values.owner === "HOUSEHOLD" &&
    values.source !== "JOINT";

  const transferError = isTransfer
    ? transferValidationError(values.source, values.destination)
    : null;

  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    if (!dbReady) return;
    if (isTransfer) {
      setCategories([]);
      return;
    }
    setCategories(categoriesRepo.list(isIncome ? "INCOME" : "EXPENSE"));
  }, [dbReady, isIncome, isTransfer]);

  const typeOptions: ReadonlyArray<SegmentedOption<TxFormType>> = [
    { value: "EXPENSE", label: t("addExpense.type.expense") },
    { value: "INCOME", label: t("addExpense.type.income") },
    { value: "TRANSFER", label: t("addExpense.type.transfer") },
  ];

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

  const set = <K extends keyof TransactionFormValues>(
    key: K,
    value: TransactionFormValues[K],
  ) => onChange({ ...values, [key]: value });

  return (
    <>
      <SegmentedControl
        options={typeOptions}
        value={values.type}
        onChange={(v) => set("type", v)}
        className="w-full justify-stretch [&>button]:flex-1 mt-1"
        ariaLabel={t("addExpense.type.label")}
      />

      <Card className="relative bg-gradient-to-b from-surface to-surface-2 px-4 py-3 space-y-1.5 mt-3">
        <DateChip
          value={values.date}
          onChange={(v) => set("date", v)}
        />
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
              value={values.amountText}
              onChange={(e) => set("amountText", sanitizeAmountInput(e.target.value))}
              className={cn(
                "bg-transparent border-0 outline-none text-center",
                "font-display text-5xl font-semibold tabular-nums tracking-tight",
                "w-[min(70%,260px)]",
                isIncome ? "text-positive-ink" : "text-text-primary",
                "placeholder:text-text-muted",
              )}
            />
          </div>
        </div>

        {!isIncome && !isTransfer && (
          <>
            <FlowDiagram source={values.source} owner={values.owner} />
            <div className="flex justify-center">
              <SettlementChip settlement={settlement} />
            </div>
          </>
        )}
      </Card>

      <Section
        label={
          isTransfer
            ? t("addExpense.transferFrom")
            : isIncome
              ? t("addExpense.receivedIn")
              : t("addExpense.paidFrom")
        }
      >
        <SegmentedControl
          options={sourceOptions}
          value={values.source}
          onChange={(v) => set("source", v)}
          className="w-full justify-stretch [&>button]:flex-1"
          ariaLabel={
            isTransfer
              ? t("addExpense.transferFrom")
              : isIncome
                ? t("addExpense.receivedIn")
                : t("addExpense.paidFrom")
          }
        />
      </Section>

      {isTransfer && (
        <Section label={t("addExpense.transferTo")}>
          <SegmentedControl
            options={sourceOptions}
            value={values.destination}
            onChange={(v) => set("destination", v)}
            className="w-full justify-stretch [&>button]:flex-1"
            ariaLabel={t("addExpense.transferTo")}
          />
          {transferError && (
            <p className="t-label text-xs text-expense-ink mt-1.5">
              {transferError === "same"
                ? t("addExpense.transferErrorSame")
                : t("addExpense.transferErrorPersonalToPersonal")}
            </p>
          )}
        </Section>
      )}

      {!isTransfer && (
        <Section
          label={isIncome ? t("addExpense.receivedBy") : t("addExpense.belongsTo")}
        >
          <SegmentedControl
            options={ownerOptions}
            value={values.owner}
            onChange={(v) => set("owner", v)}
            className="w-full justify-stretch [&>button]:flex-1"
            ariaLabel={
              isIncome ? t("addExpense.receivedBy") : t("addExpense.belongsTo")
            }
          />
        </Section>
      )}

      {isShared && (
        <Section
          label={t("addExpense.splitLabel", {
            fran: values.splitFranPercent,
            sam: 100 - values.splitFranPercent,
          })}
        >
          <Slider
            value={values.splitFranPercent}
            onValueChange={(v) => set("splitFranPercent", v)}
            ariaLabel={t("addExpense.split")}
          />
        </Section>
      )}

      {!isTransfer && (
        <Section label={t("addExpense.category")}>
          <CategoryPicker
            categories={categories}
            value={values.categoryId}
            onChange={(id) => set("categoryId", id)}
          />
        </Section>
      )}

      <Section label={t("addExpense.description")}>
        <Input
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder={t("addExpense.descriptionPlaceholder")}
        />
      </Section>
    </>
  );
}

/**
 * Compact date chip overlaid in the top-right corner of the amount Card.
 * Renders the formatted date as text ("Hoy" if today, else "30 may") and
 * uses an invisible native `<input type="date">` overlay so a tap opens
 * the platform's picker — keeps the date editable without spending a
 * full form section on it.
 */
function DateChip({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const isToday = value === today;
  const label = isToday
    ? t("addExpense.today")
    : new Date(value + "T00:00:00").toLocaleDateString(i18n.language, {
        day: "numeric",
        month: "short",
      });

  function openPicker() {
    const el = inputRef.current;
    if (!el) return;
    // Prefer the explicit API (iOS 16+, modern browsers). Fall back to
    // focus+click which still opens the native picker on some Androids.
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        // showPicker can throw if not user-activated; fall through.
      }
    }
    el.focus();
    el.click();
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        aria-label={t("addExpense.date")}
        className={cn(
          "absolute top-2 right-2 inline-flex items-center gap-1.5",
          "h-7 px-2.5 rounded-full bg-surface-2/80 backdrop-blur",
          "border border-border text-xs font-medium text-text-secondary",
          "cursor-pointer select-none",
        )}
      >
        <Calendar className="size-3.5" aria-hidden />
        <span>{label}</span>
      </button>
      {/* Hidden but focusable so showPicker() / click() can target it. */}
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden
        className="absolute top-2 right-2 size-0 opacity-0 pointer-events-none"
      />
    </>
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
    <section className="mt-4 space-y-2">
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
        <span className="size-2 rounded-full" style={{ background: color }} />
      )}
      {label}
    </button>
  );
}
