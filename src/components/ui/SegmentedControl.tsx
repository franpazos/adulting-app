import { useId } from "react";
import { cn } from "@/lib/utils/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** "violet" gives the iOS-style violet pill on active. "surface" is neutral. */
  tone?: "violet" | "surface";
  className?: string;
  ariaLabel?: string;
}

/**
 * iOS-style segmented control with a sliding background pill.
 *
 * The pill is positioned via pure CSS — width = 1/N of the track, left
 * offset = activeIndex × (1/N). No `getBoundingClientRect` measurement,
 * which was racing with the parent route-frame animation and leaving
 * the active button's white text on a near-white background.
 *
 * All buttons share the same width (CSS grid). The component assumes
 * short, similar-length labels per set — 0.7.2 briefly tried
 * length-weighted slots so "Household" wouldn't be cramped, but the
 * desks-of-different-size layout looked unbalanced in reality on
 * narrow mobile widths. The right fix is to keep the labels short
 * (rename "Household" → "Home" in EN, "Hogar" in ES already fits) so
 * equal slots stay symmetrical.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  tone = "violet",
  className,
  ariaLabel,
}: SegmentedControlProps<T>) {
  const groupId = useId();
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const count = options.length;
  // The pill is anchored at left: 4px (matching p-1) with width = 1/N of the
  // useful track. Activation slides it via `translateX(I × 100%)` — `100%`
  // here is the pill's own width, i.e. one slot. Avoids nested calc() which
  // iOS Safari silently drops, leaving the pill unstyled.
  const slotWidthPct = 100 / count;
  // Width: each slot's share of the (track - 8px padding). Done as a single
  // calc with no nesting.
  const pillWidth = `calc(${slotWidthPct}% - ${8 / count}px)`;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "relative grid items-center rounded-full p-1",
        "bg-surface-2 border border-border",
        className,
      )}
      style={{
        gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
      }}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1 bottom-1 left-1 rounded-full",
          "transition-transform duration-200 ease-out",
          tone === "violet" ? "bg-violet" : "bg-surface",
          tone === "violet" ? "shadow-violet-glow" : "shadow-card",
        )}
        style={{
          width: pillWidth,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            id={`${groupId}-${opt.value}`}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative z-10 px-4 py-1.5 rounded-full text-sm font-medium min-h-9 text-center",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/60",
              active
                ? tone === "violet"
                  ? "text-white"
                  : "text-text-primary"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
