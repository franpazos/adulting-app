import { cn } from "@/lib/utils/cn";

/**
 * Placeholder mark for Adulting.app — abstract "A" with chart-bar gesture.
 * To be replaced with the final SVG export from the brand reference.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-violet", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="adulting-violet" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A891FA" />
          <stop offset="100%" stopColor="#7B5CF6" />
        </linearGradient>
      </defs>
      {/* Outer A silhouette */}
      <path
        d="M32 6 L58 56 H46 L32 22 L18 56 H6 Z"
        fill="url(#adulting-violet)"
      />
      {/* Inner roof gesture */}
      <path
        d="M32 24 L44 50 H38 L32 34 L26 50 H20 Z"
        fill="white"
        fillOpacity="0.92"
      />
      {/* Chart bars */}
      <rect x="28" y="42" width="3" height="8" rx="1" fill="#7B5CF6" />
      <rect x="32.5" y="38" width="3" height="12" rx="1" fill="#7B5CF6" />
    </svg>
  );
}

export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-2", className)}>
      <LogoMark className="size-7" />
      <span className="font-display text-xl font-semibold tracking-tight">
        Adulting
      </span>
      <span className="font-display text-xl font-light text-violet">.app</span>
    </span>
  );
}
