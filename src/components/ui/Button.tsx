import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

const button = cva(
  [
    "inline-flex items-center justify-center gap-2",
    "font-medium select-none whitespace-nowrap",
    "transition-[transform,background-color,opacity,box-shadow] duration-150",
    "active:scale-[0.98]",
    "disabled:opacity-50 disabled:pointer-events-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-violet text-white shadow-violet-glow hover:bg-violet/90",
        secondary:
          "bg-surface-2 text-text-primary border border-border hover:bg-surface-2/70",
        ghost: "text-text-primary hover:bg-surface-2",
        destructive: "bg-expense text-white hover:bg-expense/90",
      },
      size: {
        sm: "h-9 px-3 text-sm rounded-xl",
        md: "h-11 px-4 text-sm rounded-2xl",
        lg: "h-14 px-5 text-base rounded-2xl",
        icon: "h-10 w-10 rounded-full",
      },
      block: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      block: false,
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, ...rest }, ref) => (
    <button
      ref={ref}
      className={cn(button({ variant, size, block }), className)}
      {...rest}
    />
  ),
);
Button.displayName = "Button";
