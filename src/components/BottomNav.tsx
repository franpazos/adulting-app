import { NavLink, useNavigate } from "react-router-dom";
import { Home, ListChecks, Plus, Wallet, MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils/cn";

export function BottomNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const items = [
    { to: "/", icon: Home, label: t("nav.home"), end: true },
    { to: "/transactions", icon: ListChecks, label: t("nav.transactions") },
    { to: "/debts", icon: Wallet, label: t("nav.debts") },
    { to: "/more", icon: MoreHorizontal, label: t("nav.more") },
  ];

  return (
    <nav
      className={cn(
        "fixed bottom-0 inset-x-0 z-40",
        "pb-safe-bottom",
        "border-t border-border bg-surface/95 backdrop-blur",
      )}
      aria-label="Primary"
    >
      <div className="relative mx-auto max-w-md px-3 pt-2 pb-2">
        <div className="grid grid-cols-5 items-end gap-1">
          {items.slice(0, 2).map((it) => (
            <NavItem key={it.to} {...it} />
          ))}

          <div className="flex justify-center">
            <button
              type="button"
              aria-label={t("nav.add")}
              onClick={() => navigate("/add")}
              className={cn(
                "h-14 w-14 rounded-full bg-violet text-white",
                "shadow-violet-glow flex items-center justify-center",
                "active:scale-95 transition-transform -translate-y-3",
              )}
            >
              <Plus className="size-7" strokeWidth={2.4} />
            </button>
          </div>

          {items.slice(2).map((it) => (
            <NavItem key={it.to} {...it} />
          ))}
        </div>
      </div>
    </nav>
  );
}

interface NavItemProps {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  end?: boolean;
}

function NavItem({ to, icon: Icon, label, end }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex flex-col items-center gap-1 py-1 text-[11px] font-medium",
          isActive ? "text-violet" : "text-text-secondary",
        )
      }
    >
      <Icon className="size-5" />
      <span>{label}</span>
    </NavLink>
  );
}
