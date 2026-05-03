import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-2xl border border-border bg-surface px-4",
        "text-base placeholder:text-text-muted",
        "focus:outline-none focus:border-violet focus:ring-2 focus:ring-violet/30",
        "transition-colors",
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = "Input";

interface AmountInputProps extends Omit<InputProps, "type"> {
  currencySymbol?: string;
}

export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(
  ({ className, currencySymbol = "€", ...rest }, ref) => (
    <div
      className={cn(
        "flex items-baseline justify-center gap-2",
        "rounded-3xl bg-surface border border-border px-6 py-7",
        "shadow-card dark:shadow-card-dark",
        className,
      )}
    >
      <input
        ref={ref}
        inputMode="decimal"
        type="text"
        placeholder="0,00"
        className={cn(
          "bg-transparent border-0 outline-none",
          "font-display text-5xl font-semibold tabular-nums tracking-tight text-text-primary",
          "w-full text-center placeholder:text-text-muted",
        )}
        {...rest}
      />
      <span className="font-display text-3xl font-medium text-text-secondary">
        {currencySymbol}
      </span>
    </div>
  ),
);
AmountInput.displayName = "AmountInput";

export function FieldLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "block text-xs font-semibold uppercase tracking-widest text-text-muted mb-1.5",
        className,
      )}
    >
      {children}
    </label>
  );
}
