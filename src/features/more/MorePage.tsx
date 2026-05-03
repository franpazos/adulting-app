import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Scale,
  Repeat,
  Tags,
  Wallet,
  Settings as SettingsIcon,
  ChevronRight,
} from "lucide-react";

export function MorePage() {
  const { t } = useTranslation();

  const householdItems = [
    { to: "/settlements", icon: Scale, label: t("more.items.settlements") },
    { to: "/recurring", icon: Repeat, label: t("more.items.recurring") },
    { to: "/categories", icon: Tags, label: t("more.items.categories") },
    { to: "/accounts", icon: Wallet, label: t("more.items.accounts") },
  ];
  const prefItems = [
    { to: "/settings", icon: SettingsIcon, label: t("more.items.settings") },
  ];

  return (
    <div className="mx-auto max-w-md px-4 pt-6 pb-8 space-y-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {t("more.title")}
      </h1>

      <Section title={t("more.household")}>
        {householdItems.map((it) => (
          <Row key={it.to} {...it} />
        ))}
      </Section>

      <Section title={t("more.preferences")}>
        {prefItems.map((it) => (
          <Row key={it.to} {...it} />
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted px-1">
        {title}
      </h2>
      <div className="rounded-2xl bg-surface border border-border shadow-card divide-y divide-border overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function Row({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-3.5 active:bg-surface-2"
    >
      <span className="grid place-items-center size-9 rounded-xl bg-violet/10 text-violet">
        <Icon className="size-4.5" />
      </span>
      <span className="flex-1 font-medium">{label}</span>
      <ChevronRight className="size-4 text-text-muted" />
    </Link>
  );
}
