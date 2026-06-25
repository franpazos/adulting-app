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
import { categoriesRepo, debtsRepo, recurringRepo } from "@/lib/db";
import { autoGenerateForCurrentMonth } from "@/lib/calculations";
import type { Category, Debt, RecurringType, OwnerType, CashSource } from "@/lib/db/types";
import { useDbStore } from "@/store/dbStore";
import {
  SOURCE_TO_ACCOUNT,
  accountIdToCashSource,
} from "@/features/add-expense/sources";
import { cn } from "@/lib/utils/cn";
import {
  parseAmount,
  sanitizeAmountInput as sanitizeAmount,
  formatAmountForInput as formatAmount,
} from "@/lib/utils/format";

interface RecurringFormState {
  type: RecurringType;
  name: string;
  amountText: string;
  source: CashSource;
  owner: OwnerType;
  categoryId: string | null;
  startDate: string;
  autoInclude: boolean;
  autoGenerate: boolean;
  debtId: string | null;
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
    autoGenerate: false,
    debtId: null,
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
      autoGenerate: r.auto_generate_transaction,
      debtId: r.debt_id,
    });
    setLoaded(true);
  }, [dbReady, isEdit, id]);

  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    if (!dbReady) return;
    setCategories(
      categoriesRepo.list(state.type === "INCOME" ? "INCOME" : "EXPENSE", true),
    );
  }, [dbReady, state.type]);

  // Active debts that share the recurring's currency. Same-currency is
  // the only rule that matters at auto-gen time (no FX dance at boot);
  // cross-currency debts get paid via /debts/:id/pay where the rate is
  // captured per-payment. Today recurrings are hardcoded EUR so this
  // resolves to "EUR debts", but the concept is same-currency, not EUR.
  const recurringCurrency = "EUR";
  const [debts, setDebts] = useState<Debt[]>([]);
  useEffect(() => {
    if (!dbReady || state.type !== "DEBT_PAYMENT") return;
    setDebts(
      debtsRepo.list(true).filter((d) => d.currency_code === recurringCurrency),
    );
  }, [dbReady, state.type]);

  const amount = useMemo(() => parseAmount(state.amountText), [state.amountText]);
  const valid =
    state.name.trim().length > 0 &&
    amount > 0 &&
    (state.type !== "DEBT_PAYMENT" || state.debtId !== null);

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
        auto_generate_transaction: state.autoGenerate,
        debt_id: state.type === "DEBT_PAYMENT" ? state.debtId : null,
      };
      if (isEdit && id) {
        recurringRepo.update(id, payload);
        // Materialize the current month immediately when auto-gen is on,
        // so the user sees the effect of flipping the toggle without
        // waiting for the next boot. Idempotent — skips if a tx already
        // exists for (recurring_id, currentMonth).
        if (payload.auto_generate_transaction) {
          autoGenerateForCurrentMonth();
        }
        bumpVersion();
        navigate(`/recurring/${id}`);
      } else {
        recurringRepo.create(payload);
        if (payload.auto_generate_transaction) {
          autoGenerateForCurrentMonth();
        }
        bumpVersion();
        navigate("/recurring");
      }
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
    <div className="mx-auto max-w-md px-4 pb-32 overflow-x-hidden">
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
            className="text-expense-ink"
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

      {state.type === "DEBT_PAYMENT" && (
        <Section label={t("recurring.fields.debt")}>
          <DebtPicker
            debts={debts}
            value={state.debtId}
            onChange={(debtId) => setState((s) => ({ ...s, debtId }))}
            emptyLabel={t("recurring.fields.debtEmpty")}
            chooseLabel={t("recurring.fields.debtChoose")}
          />
        </Section>
      )}

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

      <Section label={t("recurring.fields.autoGenerate")}>
        <Card variant="flat" className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">
              {t("recurring.fields.autoGenerateLabel")}
            </p>
            <p className="t-label text-xs">
              {t("recurring.fields.autoGenerateHint")}
            </p>
          </div>
          <Toggle
            checked={state.autoGenerate}
            onCheckedChange={(v) =>
              setState((s) => ({ ...s, autoGenerate: v }))
            }
          />
        </Card>
      </Section>

      {saveError && (
        <p className="mt-3 text-sm text-expense-ink" role="alert">
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


function DebtPicker({
  debts,
  value,
  onChange,
  emptyLabel,
  chooseLabel,
}: {
  debts: Debt[];
  value: string | null;
  onChange: (id: string | null) => void;
  emptyLabel: string;
  chooseLabel: string;
}) {
  if (debts.length === 0) {
    return (
      <Card variant="flat" className="text-sm text-text-secondary">
        {emptyLabel}
      </Card>
    );
  }
  return (
    <Card variant="flat" className="p-0">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full bg-transparent border-0 outline-none px-4 py-3 text-sm font-medium text-text-primary"
      >
        <option value="">{chooseLabel}</option>
        {debts.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </Card>
  );
}
