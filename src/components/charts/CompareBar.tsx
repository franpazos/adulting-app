/**
 * Horizontal stacked bar comparing two values. Used on Home to show
 * income vs expenses at a glance — proportionally sized, color-coded.
 *
 * Both segments collapse to the empty track when both values are zero.
 */

interface CompareBarProps {
  positive: number;
  negative: number;
  height?: number;
  positiveColor?: string;
  negativeColor?: string;
  ariaLabel?: string;
}

export function CompareBar({
  positive,
  negative,
  height = 6,
  positiveColor = "rgb(var(--color-positive))",
  negativeColor = "rgb(var(--color-expense))",
  ariaLabel,
}: CompareBarProps) {
  const total = Math.max(positive + negative, 0);
  const posPct = total > 0 ? (positive / total) * 100 : 0;
  const negPct = total > 0 ? (negative / total) * 100 : 0;

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="w-full overflow-hidden rounded-full bg-border/40"
      style={{ height }}
    >
      <div className="h-full flex">
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{ width: `${posPct}%`, background: positiveColor }}
        />
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{ width: `${negPct}%`, background: negativeColor }}
        />
      </div>
    </div>
  );
}
