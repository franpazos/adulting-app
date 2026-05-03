import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
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
      <h3 className="h-card">{title}</h3>
      {description && (
        <p className="t-label max-w-xs">{description}</p>
      )}
      {action}
    </div>
  );
}
