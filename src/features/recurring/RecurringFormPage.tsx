/**
 * Recurring item form — create or edit. Same minimum field set as the
 * spec data model: type, name, amount, source/owner, category, active,
 * auto-include in projection. Day-of-month is derived from start_date.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Trash2 } from "lucide-react";

import {
  Button,
  Card,
  CardEyebrow,
  IconButton,
  Input,
  Pill,
  SegmentedControl,
  Toggle,
  type SegmentedOption,
} from "@/components/ui";
import { categoriesRepo, recurringRepo } from "@/lib/db";
import type { Category, RecurringType, OwnerType, CashSource } from "@/lib/db/types";
import { useDbStore } from "@/store/dbStore";
import {
  SOURCE_TO_ACCOUNT,
  accountIdToCashSource,
} from "@/features/add-expense/sources";
import { cn } from "@/lib/utils/cn";

interface RecurringFormState {
  type: RecurringType;
  name: string;
  amountText: string;
  source: CashSource;
  owner: OwnerType;
  categoryId: string | null;
  startDate: string;
  autoInclude: boolean;
}

function defaultState(): RecurringFormState {
  return {
    type: "EXPENSE",
    name: "",
    amountText: "",
    source: "JOINT",
    owner: "HOUSEHOLD",
    categoryId: null,
    startDate: new Date().toISOString().slice(0, 10),
    autoInclude: true,
  };
}

export function RecurringFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = id !== undefined && id !== "new";
  const dbReady = useDbStore((s) => s.status === "ready");
  const bumpVersion = useDbStore((s) => s.bumpVersion);

  const [state, setState] = useState<RecurringFormState>(defaultState);
  const [loaded, setLoaded] = useState(!isEdit);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!dbReady || !isEdit || !id) return;
    const r = recurringRepo.getById(id);
    if (!r) {
      setLoaded(true);
      return;
    }
    setState({
      type: r.type,
      name: r.name,
      amountText: formatAmount(r.amount),
      source: r.source_account_id
        ? accountIdToCashSource(r.source_account_id)
        : "JOINT",
      owner: r.owner_type,
      categoryId: r.category_id,
      startDate: r.start_date,
      autoInclude: r.auto_include_in_projection,
    });
    setLoaded(true);
  }, [dbReady, isEdit, id]);

  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    if (!dbReady) return;
    setCategories(
      categoriesRepo.list(state.type === "INCOME" ? "INCOME" : "EXPENSE"),
    );
  }, [dbReady, state.type]);

  const amount = useMemo(() => parseAmount(state.amountText), [state.amountText]);
  const valid = state.name.trim().length > 0 && amount > 0;

  const typeOptions: ReadonlyArray<SegmentedOption<RecurringType>> = [
    { value: "EXPENSE", label: t("recurring.types.expense") },
    { value: "INCOME", label: t("recurring.types.income") },
    { value: "DEBT_PAYMENT", label: t("recurring.types.debt") },
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

  function handleSave() {
    if (!dbReady || !valid || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        type: state.type,
        name: state.name.trim(),
        amount,
        currency_code: "EUR",
        frequency: "MONTHLY" as const,
        start_date: state.startDate,
        end_date: null,
        category_id: state.categoryId,
        source_account_id: SOURCE_TO_ACCOUNT[state.source],
        owner_type: state.owner,
        default_shared_split_percent:
          state.owner === "HOUSEHOLD" ? 50 : null,
        is_active: true,
        auto_include_in_projection: state.autoInclude,
        auto_generate_transaction: false,
      };
      if (isEdit && id) {
        recurringRepo.update(id, payload);
      } else {
        recurringRepo.create(payload);
      }
      bumpVersion();
      navigate("/recurring");
    } catch (err) {
      console.error("[recurring-form] save failed", err);
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  function handleDeactivate() {
    if (!isEdit || !id) return;
    if (!window.confirm(t("recurring.confirmDeactivate"))) return;
    try {
      recurringRepo.deactivate(id);
      bumpVersion();
      navigate("/recurring");
    } catch (err) {
      console.error("[recurring-form] deactivate failed", err);
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-32">
      <div className="flex items-center justify-between pt-4 pb-2">
        <IconButton
          aria-label={t("common.cancel")}
          onClick={() => navigate(-1)}
        >
          <ChevronLeft className="size-5" />
        </IconButton>
        <h1 className="font-display text-base font-semibold">
          {isEdit ? t("recurring.editTitle") : t("recurring.newTitle")}
        </h1>
        {isEdit ? (
          <IconButton
            aria-label={t("common.delete")}
            onClick={handleDeactivate}
            className="text-expense"
          >
            <Trash2 className="size-5" />
          </IconButton>
        ) : (
          <span className="size-10" aria-hidden />
        )}
      </div>

      <Section label={t("recurring.fields.type")}>
        <SegmentedControl
          options={typeOptions}
          value={state.type}
          onChange={(v) => setState((s) => ({ ...s, type: v }))}
          className="w-full justify-stretch [&>button]:flex-1"
          ariaLabel={t("recurring.fields.type")}
        />
      </Section>

      <Section label={t("recurring.fields.name")}>
        <Input
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          placeholder={t("recurring.fields.namePlaceholder")}
        />
      </Section>

      <Section label={t("recurring.fields.amount")}>
        <Card variant="flat" className="flex items-baseline gap-1.5 px-4 py-3">
          <span className="font-display text-2xl font-medium text-text-muted">
            €
          </span>
          <input
            inputMode="decimal"
            type="text"
            placeholder="0,00"
            value={state.amountText}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                amountText: sanitizeAmount(e.target.value),
              }))
            }
            className={cn(
              "bg-transparent border-0 outline-none flex-1",
              "font-display text-2xl font-semibold tabular-nums",
              "text-text-primary placeholder:text-text-muted",
            )}
          />
          <Pill tone="neutral" className="h-7">EUR</Pill>
        </Card>
      </Section>

      <Section label={t("recurring.fields.paidFrom")}>
        <SegmentedControl
          options={sourceOptions}
          value={state.source}
          onChange={(v) => setState((s) => ({ ...s, source: v }))}
          className="w-full justify-stretch [&>button]:flex-1"
          ariaLabel={t("recurring.fields.paidFrom")}
        />
      </Section>

      <Section label={t("recurring.fields.owner")}>
        <SegmentedControl
          options={ownerOptions}
          value={state.owner}
          onChange={(v) => setState((s) => ({ ...s, owner: v }))}
          className="w-full justify-stretch [&>button]:flex-1"
          ariaLabel={t("recurring.fields.owner")}
        />
      </Section>

      <Section label={t("recurring.fields.category")}>
        <CategoryPicker
          categories={categories}
          value={state.categoryId}
          onChange={(id) => setState((s) => ({ ...s, categoryId: id }))}
        />
      </Section>

      <Section label={t("recurring.fields.startDate")}>
        <Input
          type="date"
          value={state.startDate}
          onChange={(e) => setState((s) => ({ ...s, startDate: e.target.value }))}
        />
      </Section>

      <Section label={t("recurring.fields.autoInclude")}>
        <Card variant="flat" className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">
              {t("recurring.fields.autoIncludeLabel")}
            </p>
            <p className="t-label text-xs">
              {t("recurring.fields.autoIncludeHint")}
            </p>
          </div>
          <Toggle
            checked={state.autoInclude}
            onCheckedChange={(v) =>
              setState((s) => ({ ...s, autoInclude: v }))
            }
          />
        </Card>
      </Section>

      {saveError && (
        <p className="mt-3 text-sm text-expense" role="alert">
          {saveError}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 pointer-events-none">
        <div className="mx-auto max-w-md px-4 pb-safe-bottom pb-4 pointer-events-auto">
          <Button
            block
            size="lg"
            disabled={!valid || saving || !loaded}
            onClick={handleSave}
            className="bg-gradient-to-br from-violet-soft via-violet to-violet-ink text-white shadow-violet-glow"
          >
            {saving ? t("common.loading") : t("common.save")}
          </Button>
        </div>
      </div>
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
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "inline-flex items-center gap-2 px-3 h-9 rounded-full whitespace-nowrap",
          "text-sm font-medium border transition-colors",
          value === null
            ? "bg-violet text-white border-transparent shadow-violet-glow"
            : "bg-surface text-text-secondary border-border",
        )}
      >
        —
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={cn(
            "inline-flex items-center gap-2 px-3 h-9 rounded-full whitespace-nowrap",
            "text-sm font-medium border transition-colors",
            value === c.id
              ? "bg-violet text-white border-transparent shadow-violet-glow"
              : "bg-surface text-text-secondary border-border",
          )}
        >
          {c.color && (
            <span
              className="size-2 rounded-full"
              style={{ background: c.color }}
            />
          )}
          {c.name}
        </button>
      ))}
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
  let out = text.replace(/[^\d,.]/g, "");
  const firstSep = out.search(/[,.]/);
  if (firstSep !== -1) {
    out =
      out.slice(0, firstSep + 1) + out.slice(firstSep + 1).replace(/[,.]/g, "");
  }
  return out;
}

function formatAmount(n: number): string {
  if (n === 0) return "";
  return n.toFixed(2).replace(".", ",");
}
