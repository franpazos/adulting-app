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
        // Ink variants for text — vivid hue on its own 10% tint fails AA;
        // the -ink token is calibrated to ≥ 4.5:1 in both themes.
        violet:
          "bg-violet/15 text-violet-ink dark:bg-violet/25 dark:text-violet-soft",
        positive: "bg-positive/15 text-positive-ink dark:bg-positive/25",
        expense: "bg-expense/15 text-expense-ink dark:bg-expense/25",
        info: "bg-info/15 text-info-ink dark:bg-info/25",
        warning: "bg-warning/15 text-warning-ink dark:bg-warning/25",
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
