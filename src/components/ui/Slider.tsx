import * as RSlider from "@radix-ui/react-slider";
import { cn } from "@/lib/utils/cn";

interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  ariaLabel,
  className,
}: SliderProps) {
  return (
    <RSlider.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={ariaLabel}
      onValueChange={(v) => onValueChange(v[0] ?? 0)}
      className={cn(
        "relative flex h-7 w-full select-none items-center",
        "disabled:opacity-50",
        className,
      )}
    >
      <RSlider.Track className="relative h-1.5 w-full grow rounded-full bg-border">
        <RSlider.Range className="absolute h-full rounded-full bg-violet" />
      </RSlider.Track>
      <RSlider.Thumb
        className={cn(
          "block size-6 rounded-full bg-white border-2 border-violet shadow-card",
          "transition-transform active:scale-110",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        )}
      />
    </RSlider.Root>
  );
}
