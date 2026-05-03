import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AmountInput,
  Card,
  CardEyebrow,
  FieldLabel,
  Input,
  SegmentedControl,
  Slider,
  Toggle,
  Button,
} from "@/components/ui";

/**
 * Phase 1 preview of Add Expense — purely visual demo of design system
 * (AmountInput + segmented + slider + toggle). No persistence, no
 * settlement preview yet. Phase 5 implements the real flow.
 */
export function AddExpensePage() {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState<"fran" | "sam" | "joint">("joint");
  const [owner, setOwner] = useState<"fran" | "sam" | "household">("household");
  const [shared, setShared] = useState(true);
  const [splitFran, setSplitFran] = useState(50);

  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-32 space-y-5">
      <h1 className="h-display">{t("expense.add")}</h1>

      <AmountInput
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        currencySymbol="€"
      />

      <Card variant="flat" className="space-y-4">
        <div>
          <FieldLabel>Cash source · Pagado por</FieldLabel>
          <SegmentedControl
            options={[
              { value: "fran", label: "Fran" },
              { value: "sam", label: "Sam" },
              { value: "joint", label: "Joint" },
            ]}
            value={source}
            onChange={setSource}
            className="w-full justify-stretch [&>button]:flex-1"
          />
        </div>
        <div>
          <FieldLabel>Owner · Pertenece a</FieldLabel>
          <SegmentedControl
            options={[
              { value: "fran", label: "Fran" },
              { value: "sam", label: "Sam" },
              { value: "household", label: "Hogar" },
            ]}
            value={owner}
            onChange={setOwner}
            className="w-full justify-stretch [&>button]:flex-1"
          />
        </div>
        <div className="flex items-center justify-between">
          <FieldLabel className="mb-0">Shared</FieldLabel>
          <Toggle checked={shared} onCheckedChange={setShared} />
        </div>
        {shared && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <FieldLabel className="mb-0">Split</FieldLabel>
              <span className="t-label tabular-nums">
                Fran {splitFran}% · Sam {100 - splitFran}%
              </span>
            </div>
            <Slider value={splitFran} onValueChange={setSplitFran} />
          </div>
        )}
      </Card>

      <Card variant="accent">
        <CardEyebrow>Live preview</CardEyebrow>
        <p className="mt-2 text-sm text-text-primary">
          Phase 5 will show the consequence of this entry here ("Pagado por
          Sam · pertenece a Hogar · Fran le deberá X €").
        </p>
      </Card>

      <div className="flex gap-2">
        <Button variant="secondary" block>
          {t("common.cancel")}
        </Button>
        <Button block disabled>
          {t("common.save")}
        </Button>
      </div>

      <Input placeholder="Description / merchant" />
    </div>
  );
}
