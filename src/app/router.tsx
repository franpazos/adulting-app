import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./AppShell";
import { HomePage } from "@/features/home/HomePage";
import { TransactionsPage } from "@/features/transactions/TransactionsPage";
import { AddExpensePage } from "@/features/add-expense/AddExpensePage";
import { DebtsPage } from "@/features/debts/DebtsPage";
import { MorePage } from "@/features/more/MorePage";
import { SettingsPage } from "@/features/settings/SettingsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "transactions", element: <TransactionsPage /> },
      { path: "add", element: <AddExpensePage /> },
      { path: "debts", element: <DebtsPage /> },
      { path: "more", element: <MorePage /> },
      { path: "settings", element: <SettingsPage /> },
      // Phase 4+ screens scaffolded later:
      { path: "settlements", element: <ComingSoon name="Settlements" /> },
      { path: "recurring", element: <ComingSoon name="Recurring" /> },
      { path: "categories", element: <ComingSoon name="Categories" /> },
      { path: "accounts", element: <ComingSoon name="Accounts" /> },
    ],
  },
]);

function ComingSoon({ name }: { name: string }) {
  return (
    <div className="mx-auto max-w-md px-4 pt-8 pb-8">
      <div className="rounded-2xl bg-surface border border-border p-5 shadow-card">
        <h1 className="font-display text-2xl font-semibold mb-1">{name}</h1>
        <p className="text-text-secondary">Coming in a later phase.</p>
      </div>
    </div>
  );
}
