import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "surface" | "ghost" | "violet";
  size?: "sm" | "md" | "lg";
};

const sizeMap = {
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = "surface", size = "md", ...rest }, ref) => (
    <button
      ref={ref}
      className={cn(
        "relative grid place-items-center rounded-full",
        "transition-[transform,background-color] duration-150",
        "active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/60",
        // Ensure a 44×44 tappable area even when the visible button is
        // smaller (Apple HIG / WCAG mobile target). The transparent
        // pseudo-element doesn't affect layout.
        "before:absolute before:inset-0 before:m-auto before:h-11 before:w-11 before:content-['']",
        sizeMap[size],
        variant === "surface" &&
          "bg-surface border border-border text-text-secondary hover:bg-surface-2",
        variant === "ghost" && "text-text-secondary hover:bg-surface-2",
        variant === "violet" &&
          "bg-violet text-white shadow-violet-glow hover:bg-violet/90",
        className,
      )}
      {...rest}
    />
  ),
);
IconButton.displayName = "IconButton";
