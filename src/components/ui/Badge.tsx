import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils/cn";

type BadgeProps = ComponentPropsWithoutRef<"span"> & {
  /** Render as a small dot rather than a pill */
  dot?: boolean;
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, dot = false, children, ...rest }, ref) => {
    if (dot) {
      return (
        <span
          ref={ref}
          className={cn(
            "inline-block size-2 rounded-full bg-expense",
            className,
          )}
          {...rest}
        />
      );
    }
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center min-w-5 h-5 px-1.5",
          "rounded-full bg-expense text-white text-[10px] font-semibold",
          className,
        )}
        {...rest}
      >
        {children}
      </span>
    );
  },
);
Badge.displayName = "Badge";
