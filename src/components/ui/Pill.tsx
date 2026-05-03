import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils/cn";

const pill = cva(
  [
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1",
    "text-xs font-medium select-none whitespace-nowrap",
    "transition-colors",
  ],
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-text-secondary",
        violet: "bg-violet/10 text-violet dark:bg-violet/20",
        positive: "bg-positive/10 text-positive dark:bg-positive/20",
        expense: "bg-expense/10 text-expense dark:bg-expense/20",
        info: "bg-info/10 text-info dark:bg-info/20",
        warning: "bg-warning/10 text-warning dark:bg-warning/20",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

type PillProps = ComponentPropsWithoutRef<"span"> & VariantProps<typeof pill>;

export const Pill = forwardRef<HTMLSpanElement, PillProps>(
  ({ className, tone, ...rest }, ref) => (
    <span ref={ref} className={cn(pill({ tone }), className)} {...rest} />
  ),
);
Pill.displayName = "Pill";
