import { cn } from "@/lib/utils/cn";

/**
 * Adulting.app symbol — abstract A with chart-bar gesture.
 * Final brand asset (mirrors `src/assets/brand/adulting-logo.svg`). Inlined
 * here so the gradient ids are local to the rendered tree (avoids id
 * collisions when multiple instances exist on the page).
 */
export function LogoMark({
  className,
  style,
  title = "Adulting.app",
}: {
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 240 240"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
      style={style}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id="al-leftFace" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#C9BEFF" />
          <stop offset="50%" stopColor="#9C8BF0" />
          <stop offset="100%" stopColor="#6E5DD4" />
        </linearGradient>
        <linearGradient id="al-rightFace" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9583EC" />
          <stop offset="55%" stopColor="#6E5DD4" />
          <stop offset="100%" stopColor="#4B3BA8" />
        </linearGradient>
        <linearGradient id="al-apexFold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E9E2FF" />
          <stop offset="100%" stopColor="#9C8BF0" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="al-innerLeft" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#C9BEFF" />
          <stop offset="50%" stopColor="#9C8BF0" />
          <stop offset="100%" stopColor="#6E5DD4" />
        </linearGradient>
        <linearGradient id="al-innerRight" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9583EC" />
          <stop offset="55%" stopColor="#6E5DD4" />
          <stop offset="100%" stopColor="#4B3BA8" />
        </linearGradient>
        <linearGradient id="al-barFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8C7BEC" />
          <stop offset="100%" stopColor="#5E4DC4" />
        </linearGradient>
        <filter id="al-creaseShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" />
          <feOffset dx="0" dy="2.5" result="off" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.55" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="al-valleyShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.8" />
        </filter>
      </defs>

      {/* Outer A faces */}
      <path d="M 120 26 L 220 214 L 176 214 L 120 108 Z" fill="url(#al-rightFace)" />
      <path d="M 120 26 L 20 214 L 64 214 L 120 108 Z" fill="url(#al-leftFace)" />
      {/* Apex fold highlight */}
      <path d="M 120 26 L 113 60 L 120 70 L 127 60 Z" fill="url(#al-apexFold)" />
      {/* Inner roof crease */}
      <g filter="url(#al-creaseShadow)">
        <path
          d="M 120 138 L 48.5 160.6 L 92.1 160.8 L 120 152 Z"
          fill="url(#al-innerLeft)"
        />
        <path
          d="M 120 138 L 191.5 160.6 L 147.9 160.8 L 120 152 Z"
          fill="url(#al-innerRight)"
        />
      </g>
      {/* Highlights along the roof line */}
      <path
        d="M 120 134 L 48.5 156.6 L 51 160 L 120 138 Z"
        fill="#FFFFFF"
        opacity="0.32"
      />
      <path
        d="M 120 134 L 191.5 156.6 L 189 160 L 120 138 Z"
        fill="#FFFFFF"
        opacity="0.22"
      />
      {/* Valley shadows */}
      <path
        d="M 120 138 L 120 152 L 92.1 160.8 L 48.5 160.6 Z"
        fill="#1F1556"
        opacity="0.16"
        filter="url(#al-valleyShadow)"
      />
      <path
        d="M 120 138 L 120 152 L 147.9 160.8 L 191.5 160.6 Z"
        fill="#1F1556"
        opacity="0.26"
        filter="url(#al-valleyShadow)"
      />
      {/* Center seam */}
      <path
        d="M 120 138 L 120 152"
        stroke="#FFFFFF"
        strokeOpacity="0.5"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      {/* Chart bars */}
      <g>
        <rect x="102" y="200" width="11" height="14" rx="2.2" fill="url(#al-barFill)" />
        <rect x="114.5" y="190" width="11" height="24" rx="2.2" fill="url(#al-barFill)" />
        <rect x="127" y="180" width="11" height="34" rx="2.2" fill="url(#al-barFill)" />
      </g>
    </svg>
  );
}

/** Wordmark with the violet `.app` suffix. Used on splash and About surfaces. */
export function LogoWordmark({
  className,
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-2", className)}>
      <LogoMark style={{ width: size, height: size }} className="self-center" />
      <span
        className="font-display font-semibold tracking-tight"
        style={{ fontSize: size * 0.78 }}
      >
        Adulting
      </span>
      <span
        className="font-display font-medium text-violet tracking-tight"
        style={{ fontSize: size * 0.78 }}
      >
        .app
      </span>
    </span>
  );
}
