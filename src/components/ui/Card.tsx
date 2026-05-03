import { cn } from "@/lib/utils/cn";
import type { ComponentPropsWithoutRef } from "react";

type CardProps = ComponentPropsWithoutRef<"div"> & {
  /** Visual emphasis — `flat` removes shadow, `accent` uses violet tint */
  variant?: "default" | "flat" | "accent";
  /** Tighter padding for compact list-style cards */
  compact?: boolean;
};

export function Card({
  className,
  variant = "default",
  compact = false,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-surface border-border",
        variant === "default" && "shadow-card dark:shadow-card-dark",
        variant === "flat" && "shadow-none",
        variant === "accent" &&
          "bg-violet/5 border-violet/15 dark:bg-violet/10",
        compact ? "p-3" : "p-5",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  className,
  ...rest
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn("flex items-center justify-between mb-3", className)}
      {...rest}
    />
  );
}

export function CardTitle({
  className,
  ...rest
}: ComponentPropsWithoutRef<"h3">) {
  return <h3 className={cn("h-card", className)} {...rest} />;
}

export function CardEyebrow({
  className,
  ...rest
}: ComponentPropsWithoutRef<"span">) {
  return <span className={cn("t-eyebrow", className)} {...rest} />;
}
