import { useId, useLayoutEffect, useRef, useState } from "react";
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
 * The pill is positioned absolutely and animates between the active button.
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
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState<{ left: number; width: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    const btn = buttonRefs.current[value];
    if (!container || !btn) return;
    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    setPill({ left: bRect.left - cRect.left, width: bRect.width });
  }, [value, options.length]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex items-center rounded-full p-1",
        "bg-surface-2 border border-border",
        className,
      )}
    >
      {pill && (
        <span
          aria-hidden
          className={cn(
            "absolute top-1 bottom-1 rounded-full transition-[transform,width] duration-200 ease-out",
            tone === "violet" ? "bg-violet" : "bg-surface",
            tone === "violet" ? "shadow-violet-glow" : "shadow-card",
          )}
          style={{
            transform: `translateX(${pill.left - 4}px)`,
            width: pill.width,
            left: 4,
          }}
        />
      )}
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              buttonRefs.current[opt.value] = el;
            }}
            id={`${groupId}-${opt.value}`}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative z-10 px-4 py-1.5 rounded-full text-sm font-medium",
              "transition-colors duration-150",
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
