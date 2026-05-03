import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./AppShell";
import { HomePage } from "@/features/home/HomePage";
import { TransactionsPage } from "@/features/transactions/TransactionsPage";
import { EditExpensePage } from "@/features/transactions/EditExpensePage";
import { AddExpensePage } from "@/features/add-expense/AddExpensePage";
import { DebtsPage } from "@/features/debts/DebtsPage";
import { DebtDetailPage } from "@/features/debts/DebtDetailPage";
import { PayDebtPage } from "@/features/debts/PayDebtPage";
import { MorePage } from "@/features/more/MorePage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { SettlementsPage } from "@/features/settlements/SettlementsPage";
import { SettleUpPage } from "@/features/settlements/SettleUpPage";
import { RecurringPage } from "@/features/recurring/RecurringPage";
import { RecurringFormPage } from "@/features/recurring/RecurringFormPage";
import { CategoriesPage } from "@/features/categories/CategoriesPage";
import { CategoryFormPage } from "@/features/categories/CategoryFormPage";
import { AccountsPage } from "@/features/accounts/AccountsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "transactions", element: <TransactionsPage /> },
      { path: "transactions/:id", element: <EditExpensePage /> },
      { path: "add", element: <AddExpensePage /> },
      { path: "debts", element: <DebtsPage /> },
      { path: "debts/:id", element: <DebtDetailPage /> },
      { path: "debts/:id/pay", element: <PayDebtPage /> },
      { path: "more", element: <MorePage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "settlements", element: <SettlementsPage /> },
      { path: "settlements/settle", element: <SettleUpPage /> },
      { path: "recurring", element: <RecurringPage /> },
      { path: "recurring/new", element: <RecurringFormPage /> },
      { path: "recurring/:id", element: <RecurringFormPage /> },
      { path: "categories", element: <CategoriesPage /> },
      { path: "categories/new", element: <CategoryFormPage /> },
      { path: "categories/:id", element: <CategoryFormPage /> },
      { path: "accounts", element: <AccountsPage /> },
    ],
  },
]);
