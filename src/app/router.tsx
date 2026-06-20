import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./AppShell";
import { HomePage } from "@/features/home/HomePage";
import { LogoMark } from "@/components/Logo";

// Home stays eager — it's the landing page after boot, the bundle savings
// from lazy-loading it would be cancelled by the extra loading spinner on
// first paint. Everything else is code-split: each feature becomes its own
// chunk, fetched on first navigation.
const TransactionsPage = lazyNamed(
  () => import("@/features/transactions/TransactionsPage"),
  "TransactionsPage",
);
const EditExpensePage = lazyNamed(
  () => import("@/features/transactions/EditExpensePage"),
  "EditExpensePage",
);
const AddExpensePage = lazyNamed(
  () => import("@/features/add-expense/AddExpensePage"),
  "AddExpensePage",
);
const DebtsPage = lazyNamed(
  () => import("@/features/debts/DebtsPage"),
  "DebtsPage",
);
const DebtDetailPage = lazyNamed(
  () => import("@/features/debts/DebtDetailPage"),
  "DebtDetailPage",
);
const PayDebtPage = lazyNamed(
  () => import("@/features/debts/PayDebtPage"),
  "PayDebtPage",
);
const DebtFormPage = lazyNamed(
  () => import("@/features/debts/DebtFormPage"),
  "DebtFormPage",
);
const MorePage = lazyNamed(
  () => import("@/features/more/MorePage"),
  "MorePage",
);
const SettingsPage = lazyNamed(
  () => import("@/features/settings/SettingsPage"),
  "SettingsPage",
);
const SettlementsPage = lazyNamed(
  () => import("@/features/settlements/SettlementsPage"),
  "SettlementsPage",
);
const SettleUpPage = lazyNamed(
  () => import("@/features/settlements/SettleUpPage"),
  "SettleUpPage",
);
const RecurringPage = lazyNamed(
  () => import("@/features/recurring/RecurringPage"),
  "RecurringPage",
);
const RecurringFormPage = lazyNamed(
  () => import("@/features/recurring/RecurringFormPage"),
  "RecurringFormPage",
);
const CategoriesPage = lazyNamed(
  () => import("@/features/categories/CategoriesPage"),
  "CategoriesPage",
);
const CategoryFormPage = lazyNamed(
  () => import("@/features/categories/CategoryFormPage"),
  "CategoryFormPage",
);
const AccountsPage = lazyNamed(
  () => import("@/features/accounts/AccountsPage"),
  "AccountsPage",
);
const ConflictsPage = lazyNamed(
  () => import("@/features/sync/ConflictsPage"),
  "ConflictsPage",
);
const FeedbackPage = lazyNamed(
  () => import("@/features/feedback/FeedbackPage"),
  "FeedbackPage",
);

/** Wrap a named-export module so it can be passed to `React.lazy`. */
function lazyNamed<K extends string>(
  importer: () => Promise<Record<K, React.ComponentType>>,
  name: K,
) {
  return lazy(async () => {
    const mod = await importer();
    return { default: mod[name] };
  });
}

function PageFallback() {
  return (
    <div className="min-h-[60vh] grid place-items-center text-text-secondary">
      <div className="flex flex-col items-center gap-2 animate-pulse">
        <LogoMark className="size-8 opacity-60" />
      </div>
    </div>
  );
}

function Lazy(node: ReactNode): ReactNode {
  return <Suspense fallback={<PageFallback />}>{node}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "transactions", element: Lazy(<TransactionsPage />) },
      { path: "transactions/:id", element: Lazy(<EditExpensePage />) },
      { path: "add", element: Lazy(<AddExpensePage />) },
      { path: "debts", element: Lazy(<DebtsPage />) },
      { path: "debts/new", element: Lazy(<DebtFormPage />) },
      { path: "debts/:id", element: Lazy(<DebtDetailPage />) },
      { path: "debts/:id/edit", element: Lazy(<DebtFormPage />) },
      { path: "debts/:id/pay", element: Lazy(<PayDebtPage />) },
      { path: "more", element: Lazy(<MorePage />) },
      { path: "settings", element: Lazy(<SettingsPage />) },
      { path: "settlements", element: Lazy(<SettlementsPage />) },
      { path: "settlements/settle", element: Lazy(<SettleUpPage />) },
      { path: "recurring", element: Lazy(<RecurringPage />) },
      { path: "recurring/new", element: Lazy(<RecurringFormPage />) },
      { path: "recurring/:id", element: Lazy(<RecurringFormPage />) },
      { path: "categories", element: Lazy(<CategoriesPage />) },
      { path: "categories/new", element: Lazy(<CategoryFormPage />) },
      { path: "categories/:id", element: Lazy(<CategoryFormPage />) },
      { path: "accounts", element: Lazy(<AccountsPage />) },
      { path: "sync/conflicts", element: Lazy(<ConflictsPage />) },
      { path: "feedback", element: Lazy(<FeedbackPage />) },
    ],
  },
]);
