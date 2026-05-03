import { cn } from "@/lib/utils/cn";

/**
 * Sober, geometric line-art illustrations for empty states.
 * Adapted from the Claude Design handoff (`management.jsx::EmptyArt`).
 * Colors flow through the existing semantic tokens — no hex literals.
 */
export type EmptyArtKind = "transactions" | "debts" | "settlements";

interface EmptyArtProps {
  kind: EmptyArtKind;
  className?: string;
}

export function EmptyArt({ kind, className }: EmptyArtProps) {
  if (kind === "transactions") return <TransactionsArt className={className} />;
  if (kind === "debts") return <DebtsArt className={className} />;
  return <SettlementsArt className={className} />;
}

function TransactionsArt({ className }: { className?: string }) {
  return (
    <svg
      width="160"
      height="120"
      viewBox="0 0 160 120"
      fill="none"
      className={cn(className)}
      aria-hidden
    >
      <rect
        x="20" y="30" width="120" height="22" rx="6"
        className="fill-surface-2 stroke-border"
        strokeWidth="1"
      />
      <rect
        x="20" y="58" width="120" height="22" rx="6"
        className="fill-surface-2 stroke-border"
        strokeWidth="1" opacity="0.7"
      />
      <rect
        x="20" y="86" width="120" height="22" rx="6"
        className="fill-surface-2 stroke-border"
        strokeWidth="1" opacity="0.4"
      />
      <circle
        cx="32" cy="20" r="10"
        className="fill-violet-tint stroke-violet"
        strokeWidth="1.4"
      />
      <path
        d="M28 20l3 3 5-6"
        className="stroke-violet"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function DebtsArt({ className }: { className?: string }) {
  return (
    <svg
      width="160"
      height="120"
      viewBox="0 0 160 120"
      fill="none"
      className={cn(className)}
      aria-hidden
    >
      <rect
        x="30" y="40" width="100" height="60" rx="10"
        className="fill-surface-2 stroke-border"
        strokeWidth="1.4"
      />
      <line x1="30" y1="58" x2="130" y2="58" className="stroke-border" />
      <circle
        cx="80" cy="78" r="14"
        className="fill-violet-tint stroke-violet"
        strokeWidth="1.4"
      />
      <path
        d="M75 78l4 4 7-7"
        className="stroke-violet"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function SettlementsArt({ className }: { className?: string }) {
  return (
    <svg
      width="160"
      height="120"
      viewBox="0 0 160 120"
      fill="none"
      className={cn(className)}
      aria-hidden
    >
      <circle
        cx="55" cy="60" r="22"
        className="fill-violet-tint stroke-violet"
        strokeWidth="1.4"
      />
      <text
        x="55" y="65" textAnchor="middle"
        fontFamily="Sora, sans-serif"
        fontWeight="600" fontSize="16"
        className="fill-violet"
      >
        F
      </text>
      <circle
        cx="105" cy="60" r="22"
        className="fill-expense/15 stroke-expense"
        strokeWidth="1.4"
      />
      <text
        x="105" y="65" textAnchor="middle"
        fontFamily="Sora, sans-serif"
        fontWeight="600" fontSize="16"
        className="fill-expense"
      >
        S
      </text>
      <line
        x1="78" y1="60" x2="82" y2="60"
        className="stroke-positive"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <text
        x="80" y="100" textAnchor="middle"
        fontFamily="Inter, sans-serif"
        fontWeight="600" fontSize="11"
        className="fill-positive"
      >
        €0.00
      </text>
    </svg>
  );
}
