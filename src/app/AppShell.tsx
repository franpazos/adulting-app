import { Outlet } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";

export function AppShell() {
  return (
    <div className="min-h-dvh bg-bg text-text-primary flex flex-col">
      <main className="flex-1 pb-28 pt-safe-top">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
