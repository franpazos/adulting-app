import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";

import { Avatar, type AvatarWho } from "@/components/Avatar";
import { Card, CardEyebrow, IconButton, Pill } from "@/components/ui";
import { accountsRepo } from "@/lib/db";
import type { Account } from "@/lib/db/types";
import { useDbStore } from "@/store/dbStore";
import { accountBalance } from "@/lib/calculations";

export function AccountsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dbReady = useDbStore((s) => s.status === "ready");
  const dbVersion = useDbStore((s) => s.dbVersion);

  const data = useMemo(() => {
    if (!dbReady) return { accounts: [], balances: new Map<string, number>() };
    const accounts = accountsRepo.list();
    const balances = new Map<string, number>();
    for (const a of accounts) balances.set(a.id, computeBalance(a));
    return { accounts, balances };
  }, [dbReady, dbVersion]);

  const totalsByCurrency = useMemo(() => {
    const out: Record<string, number> = {};
    for (const a of data.accounts) {
      const b = data.balances.get(a.id) ?? 0;
      out[a.currency_code] = (out[a.currency_code] ?? 0) + b;
    }
    return out;
  }, [data]);

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8 space-y-5">
      <div className="flex items-center justify-between">
        <IconButton
          aria-label={t("settlements.back")}
          onClick={() => navigate("/more")}
        >
          <ChevronLeft className="size-5" />
        </IconButton>
        <h1 className="font-display text-base font-semibold">
          {t("accounts.title")}
        </h1>
        <span className="size-10" aria-hidden />
      </div>

      <section className="space-y-2">
        <CardEyebrow>{t("accounts.totals")}</CardEyebrow>
        <Card className="space-y-1">
          {Object.entries(totalsByCurrency).map(([code, total]) => (
            <div key={code} className="flex items-baseline justify-between">
              <span className="text-sm text-text-secondary">{code}</span>
              <span className="t-amount tabular-nums">
                {formatAmount(total, code)}
              </span>
            </div>
          ))}
          <p className="t-label text-xs pt-1">
            {t("accounts.balanceNote")}
          </p>
        </Card>
      </section>

      <ul className="space-y-2">
        {data.accounts.map((a) => (
          <li key={a.id}>
            <AccountCard
              account={a}
              balance={data.balances.get(a.id) ?? 0}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function AccountCard({
  account,
  balance,
}: {
  account: Account;
  balance: number;
}) {
  const { t } = useTranslation();
  const who: AvatarWho = whoFromAccount(account);
  return (
    <Card>
      <div className="flex items-center gap-3">
        <Avatar who={who} size={40} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{account.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Pill tone="neutral" className="h-5 px-2 text-[10px]">
              {account.type}
            </Pill>
            <Pill
              tone={account.currency_code === "EUR" ? "neutral" : "info"}
              className="h-5 px-2 text-[10px]"
            >
              {account.currency_code}
            </Pill>
          </div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-border flex items-baseline justify-between">
        <span className="t-label">{t("accounts.estimatedBalance")}</span>
        <span className="font-display text-lg font-semibold tabular-nums">
          {formatAmount(balance, account.currency_code)}
        </span>
      </div>
    </Card>
  );
}

function whoFromAccount(a: Account): AvatarWho {
  if (a.type === "JOINT") return "JOINT";
  // For now, owner_user_id is stable — Fran/Sam fixtures.
  // If account.name contains "Fran" or "Sam" we infer; otherwise default JOINT.
  if (a.name.toLowerCase().includes("fran")) return "FRAN";
  if (a.name.toLowerCase().includes("sam")) return "SAM";
  return "JOINT";
}

function computeBalance(a: Account): number {
  return accountBalance(a.id, a.initial_balance);
}

function formatAmount(n: number, currency: string): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(n);
}

