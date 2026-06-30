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
 * The pill is positioned via pure CSS, no `getBoundingClientRect` (an
 * earlier attempt to measure the DOM raced with the parent route-frame
 * animation and left the active button's white text on a near-white
 * background).
 *
 * Slot widths are proportional to label length (`Math.max(label.length, 3)`)
 * so "Household" gets a wider slot than "All". Characters ≠ pixels in
 * proportional fonts (Sora/Inter), but with `px-4` padding on every
 * button the imprecision is invisible at our scale. The floor of 3
 * prevents very short labels ("A") from collapsing into illegibly
 * narrow slots.
 *
 * Layout: CSS grid with `Xfr Yfr Zfr` columns assigns the button widths
 * automatically. The pill (an absolute span) is positioned with `left`
 * and `width` as percentages of the track, plus a small pixel offset
 * that accounts for the track's `p-1` (4px each side) padding. The
 * math reduces to one un-nested calc() per axis — iOS Safari friendly.
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

  const weights = options.map((o) => Math.max(o.label.length, 3));
  const totalWeight = weights.reduce((s, w) => s + w, 0) || 1;
  const weightBefore = weights
    .slice(0, activeIndex)
    .reduce((s, w) => s + w, 0);

  const offsetRatio = weightBefore / totalWeight;
  const widthRatio = (weights[activeIndex] ?? 1) / totalWeight;

  // Track has `p-1` (4px each side). For an absolute-positioned child,
  // `left: 50%` means 50% of the parent's padding box width (= the track's
  // outer width). To map a usable-area ratio (0..1) to the pill's left
  // edge we need: pillLeft = 4px + ratio * (trackW - 8px), which expands
  // to (ratio * 100%) + (4 - ratio * 8)px — one calc(), no nesting.
  const pillLeftCss = `calc(${offsetRatio * 100}% + ${(4 - offsetRatio * 8).toFixed(3)}px)`;
  const pillWidthCss = `calc(${widthRatio * 100}% - ${(widthRatio * 8).toFixed(3)}px)`;

  const gridTemplate = weights.map((w) => `${w}fr`).join(" ");

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "relative grid items-center rounded-full p-1",
        "bg-surface-2 border border-border",
        className,
      )}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1 bottom-1 rounded-full",
          "transition-[left,width] duration-200 ease-out",
          tone === "violet" ? "bg-violet" : "bg-surface",
          tone === "violet" ? "shadow-violet-glow" : "shadow-card",
        )}
        style={{
          left: pillLeftCss,
          width: pillWidthCss,
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
