/**
 * Compact SVG donut chart. Pure visual — no tooltips, no interactivity.
 * Each slice's color is provided by the caller; the donut renders in
 * declaration order. Slices below `minPercent` are merged into a single
 * neutral "Other" slice so very thin wedges don't render as visual noise.
 *
 * Designed for a single use case: the Home page category breakdown. If
 * we ever need a more general charting need, swap this for a real lib —
 * but for personal-app scale, hand-rolled SVG is the right size.
 */

interface DonutSlice {
  /** Stable identifier so React's keyed list works. */
  id: string;
  /** 0–100, percentage of the whole. Caller is responsible for summing to ≤100. */
  percent: number;
  /** CSS color string. */
  color: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  /** Outer radius in pixels; viewBox is 2r × 2r. Default 60. */
  size?: number;
  /** Stroke width as a fraction of radius, 0–1. Default 0.32 (chunky). */
  thickness?: number;
  /** Slices below this percent are merged into a neutral wedge. Default 2. */
  minPercent?: number;
  /** Optional centered label (e.g. total amount). */
  centerLabel?: React.ReactNode;
  /** Accessible label for the chart as a whole. */
  ariaLabel?: string;
}

export function DonutChart({
  slices,
  size = 60,
  thickness = 0.32,
  minPercent = 2,
  centerLabel,
  ariaLabel,
}: DonutChartProps) {
  const r = size;
  const strokeWidth = r * thickness;
  const innerR = r - strokeWidth / 2;
  const circumference = 2 * Math.PI * innerR;

  // Merge tiny slices into a neutral wedge so the donut stays clean.
  const filtered: DonutSlice[] = [];
  let merged = 0;
  for (const s of slices) {
    if (s.percent < minPercent) merged += s.percent;
    else filtered.push(s);
  }
  if (merged > 0) {
    filtered.push({
      id: "__other__",
      percent: merged,
      color: "rgb(var(--color-border))",
    });
  }

  const total = filtered.reduce((s, x) => s + x.percent, 0) || 1;

  let offset = 0;
  const segments = filtered.map((s) => {
    const fraction = s.percent / total;
    const length = circumference * fraction;
    // Tiny visual gap so adjacent slices don't blur together.
    const gap = filtered.length > 1 ? Math.min(2, length * 0.08) : 0;
    const dasharray = `${Math.max(0, length - gap)} ${circumference}`;
    const dashoffset = -offset;
    offset += length;
    return { ...s, dasharray, dashoffset };
  });

  return (
    <svg
      viewBox={`0 0 ${r * 2} ${r * 2}`}
      width={r * 2}
      height={r * 2}
      role="img"
      aria-label={ariaLabel}
      className="block"
    >
      {/* Track for the empty/no-data state. */}
      <circle
        cx={r}
        cy={r}
        r={innerR}
        fill="none"
        stroke="rgb(var(--color-border))"
        strokeWidth={strokeWidth}
        strokeOpacity={0.4}
      />
      {/* Slices. Rotate -90° so the first segment starts at 12 o'clock. */}
      <g transform={`rotate(-90 ${r} ${r})`}>
        {segments.map((s) => (
          <circle
            key={s.id}
            cx={r}
            cy={r}
            r={innerR}
            fill="none"
            stroke={s.color}
            strokeWidth={strokeWidth}
            strokeDasharray={s.dasharray}
            strokeDashoffset={s.dashoffset}
            strokeLinecap="butt"
          />
        ))}
      </g>
      {centerLabel && (
        <foreignObject x={0} y={0} width={r * 2} height={r * 2}>
          <div
            className="size-full grid place-items-center text-center"
            style={{ font: "inherit" }}
          >
            {centerLabel}
          </div>
        </foreignObject>
      )}
    </svg>
  );
}
