/**
 * Shared expense form used by both Add (`AddExpensePage`) and Edit
 * (`EditExpensePage`). Encapsulates the entire "amount + flow + segmented
 * + slider + category + date + description + live preview" block so the
 * pages only differ in title, save behavior, and the optional Delete
 * button (edit-only).
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

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
import { ConsequenceSentence } from "@/components/ConsequenceSentence";

import { expenseAllocator } from "@/lib/calculations";
import { categoriesRepo } from "@/lib/db";
import type { CashSource, OwnerType, Category } from "@/lib/db/types";
import { useDbStore } from "@/store/dbStore";
import { cn } from "@/lib/utils/cn";

export interface TransactionFormValues {
  amountText: string;
  source: CashSource;
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
    amountText: "",
    source: "JOINT",
    owner: "HOUSEHOLD",
    splitFranPercent: 50,
    date: new Date().toISOString().slice(0, 10),
    description: "",
    categoryId: null,
  };
}

export function parseAmount(text: string): number {
  if (!text) return 0;
  const normalized = text.replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function sanitizeAmount(text: string): string {
  let out = text.replace(/[^\d,.]/g, "");
  const firstSep = out.search(/[,.]/);
  if (firstSep !== -1) {
    out =
      out.slice(0, firstSep + 1) + out.slice(firstSep + 1).replace(/[,.]/g, "");
  }
  return out;
}

export function formatAmountForInput(n: number): string {
  if (n === 0) return "";
  return n.toFixed(2).replace(".", ",");
}

export function TransactionForm({ values, onChange }: TransactionFormProps) {
  const { t } = useTranslation();
  const dbReady = useDbStore((s) => s.status === "ready");

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
    values.owner === "HOUSEHOLD" && values.source !== "JOINT";

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

  const set = <K extends keyof TransactionFormValues>(
    key: K,
    value: TransactionFormValues[K],
  ) => onChange({ ...values, [key]: value });

  return (
    <>
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
              value={values.amountText}
              onChange={(e) => set("amountText", sanitizeAmount(e.target.value))}
              className={cn(
                "bg-transparent border-0 outline-none text-center",
                "font-display text-5xl font-semibold tabular-nums tracking-tight",
                "text-text-primary placeholder:text-text-muted",
                "w-[min(70%,260px)]",
              )}
            />
          </div>
        </div>

        <FlowDiagram source={values.source} owner={values.owner} />
        <div className="flex justify-center">
          <SettlementChip settlement={settlement} />
        </div>
      </Card>

      <Section label={t("addExpense.paidFrom")}>
        <SegmentedControl
          options={sourceOptions}
          value={values.source}
          onChange={(v) => set("source", v)}
          className="w-full justify-stretch [&>button]:flex-1"
          ariaLabel={t("addExpense.paidFrom")}
        />
      </Section>

      <Section label={t("addExpense.belongsTo")}>
        <SegmentedControl
          options={ownerOptions}
          value={values.owner}
          onChange={(v) => set("owner", v)}
          className="w-full justify-stretch [&>button]:flex-1"
          ariaLabel={t("addExpense.belongsTo")}
        />
      </Section>

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

      <Section label={t("addExpense.category")}>
        <CategoryPicker
          categories={categories}
          value={values.categoryId}
          onChange={(id) => set("categoryId", id)}
        />
      </Section>

      <Section label={t("addExpense.description")}>
        <Input
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder={t("addExpense.descriptionPlaceholder")}
        />
      </Section>

      <Section label={t("addExpense.date")}>
        <Input
          type="date"
          value={values.date}
          onChange={(e) => set("date", e.target.value)}
        />
      </Section>

      <div className="mt-5">
        <Card variant="accent" className="space-y-2">
          <CardEyebrow>{t("addExpense.title")}</CardEyebrow>
          <p className="text-sm leading-relaxed text-text-secondary">
            <ConsequenceSentence
              amount={amount}
              source={values.source}
              owner={values.owner}
              settlement={settlement}
            />
          </p>
        </Card>
      </div>
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
        <span className="size-2 rounded-full" style={{ background: color }} />
      )}
      {label}
    </button>
  );
}
