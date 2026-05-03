import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface EmptyStateProps {
  /** Inline icon (small) — used for compact list contexts. Mutually exclusive with `art`. */
  icon?: ReactNode;
  /** Full geometric line-art illustration — for full-screen empty states. */
  art?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /** "card" wraps in a dashed border card; "centered" is full-screen centered (no border). */
  variant?: "card" | "centered";
  className?: string;
}

export function EmptyState({
  icon,
  art,
  title,
  description,
  action,
  variant = "card",
  className,
}: EmptyStateProps) {
  if (variant === "centered") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center text-center px-6",
          "min-h-[60dvh] gap-2",
          className,
        )}
      >
        {art}
        <h3 className="h-section mt-6">{title}</h3>
        {description && (
          <p className="text-sm text-text-secondary max-w-xs leading-relaxed">
            {description}
          </p>
        )}
        {action && <div className="mt-4">{action}</div>}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        "rounded-2xl border border-dashed border-border bg-surface/40",
        "px-6 py-10 gap-3",
        className,
      )}
    >
      {icon && (
        <div className="grid place-items-center size-12 rounded-2xl bg-violet/10 text-violet">
          {icon}
        </div>
      )}
      {art}
      <h3 className="h-card">{title}</h3>
      {description && <p className="t-label max-w-xs">{description}</p>}
      {action}
    </div>
  );
}
