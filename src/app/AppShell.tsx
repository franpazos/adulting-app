import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";
import { InstallPrompt } from "@/components/InstallPrompt";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { useAutoSync } from "@/lib/sync/useAutoSync";

export function AppShell() {
  const location = useLocation();
  useAutoSync();
  return (
    <div className="min-h-dvh bg-bg text-text-primary flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-violet focus-visible:px-3 focus-visible:py-1.5 focus-visible:text-white focus-visible:shadow-card"
      >
        Skip to content
      </a>
      <UpdatePrompt />
      <main id="main-content" className="flex-1 pb-28 pt-safe-top">
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
