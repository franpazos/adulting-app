import { useEffect, type ReactNode } from "react";
import { initDb, runMigrations, seedIfEmpty } from "@/lib/db";
import { useDbStore } from "@/store/dbStore";
import { LogoMark } from "@/components/Logo";

/**
 * Bootstraps the local database before rendering app content. Runs:
 *   1. sqlite-wasm init (tries OPFS SAH Pool, falls back to in-memory)
 *   2. schema migrations (idempotent)
 *   3. seed data (only if empty)
 *
 * Renders a soft splash while initializing, an error card on failure.
 */
export function AppBoot({ children }: { children: ReactNode }) {
  const status = useDbStore((s) => s.status);
  const error = useDbStore((s) => s.error);
  const setInitializing = useDbStore((s) => s.setInitializing);
  const setReady = useDbStore((s) => s.setReady);
  const setError = useDbStore((s) => s.setError);

  useEffect(() => {
    if (status !== "idle") return;
    setInitializing();

    (async () => {
      try {
        const init = await initDb();
        runMigrations();
        const seeded = seedIfEmpty();
        setReady({
          backend: init.backend,
          warning: init.warning,
          seeded,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[boot] DB init failed:", err);
        setError(msg);
      }
    })();
  }, [status, setInitializing, setReady, setError]);

  if (status === "ready") return <>{children}</>;

  if (status === "error") {
    return (
      <div className="min-h-dvh grid place-items-center bg-bg text-text-primary p-6">
        <div className="max-w-sm rounded-2xl border border-border bg-surface shadow-card p-5 space-y-2">
          <h1 className="h-section text-expense">Database error</h1>
          <p className="t-label">{error}</p>
          <p className="t-label">Try reloading. If it persists, check that the dev server is running with COOP/COEP headers.</p>
        </div>
      </div>
    );
  }

  // idle / initializing splash
  return (
    <div className="min-h-dvh grid place-items-center bg-bg text-text-primary">
      <div className="flex flex-col items-center gap-3 animate-pulse">
        <LogoMark className="size-12" />
        <span className="font-display text-sm text-text-secondary">
          Adulting.app
        </span>
      </div>
    </div>
  );
}
