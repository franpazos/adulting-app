import * as Switch from "@radix-ui/react-switch";
import { cn } from "@/lib/utils/cn";

interface ToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function Toggle({
  checked,
  onCheckedChange,
  disabled,
  ariaLabel,
  className,
}: ToggleProps) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full",
        "bg-border data-[state=checked]:bg-violet",
        "transition-colors duration-200 disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        className,
      )}
    >
      <Switch.Thumb
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-white shadow",
          "translate-x-1 data-[state=checked]:translate-x-6",
          "transition-transform duration-200 ease-out",
        )}
      />
    </Switch.Root>
  );
}
