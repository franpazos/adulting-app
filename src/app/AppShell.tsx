import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { UpdatePrompt } from "@/components/UpdatePrompt";

export function AppShell() {
  const location = useLocation();
  return (
    <div className="min-h-dvh bg-bg text-text-primary flex flex-col">
      <UpdatePrompt />
      <main className="flex-1 pb-28 pt-safe-top">
        {/* `key` forces a remount on path change so the CSS animation re-runs */}
        <div key={location.pathname} className="route-frame">
          <Outlet />
        </div>
      </main>
      <InstallPrompt />
      <BottomNav />
    </div>
  );
}
