import { Home, Users } from "lucide-react";
import type { CashSource, OwnerType } from "@/lib/db/types";
import { cn } from "@/lib/utils/cn";

/** Logical "who" — covers both an OwnerType (FRAN/SAM/HOUSEHOLD) and JOINT. */
export type AvatarWho = OwnerType | "JOINT";

interface AvatarProps {
  who: AvatarWho;
  /** Pixel size of the bubble. Default 32. */
  size?: number;
  className?: string;
  ariaLabel?: string;
}

/**
 * Bubble showing who's involved in a transaction. Uses static brand-color
 * gradients that look the same in light + dark mode (white text always).
 * Defined in `src/styles/tokens.css`.
 */
export function Avatar({ who, size = 32, className, ariaLabel }: AvatarProps) {
  const meta = META[who];
  return (
    <span
      role="img"
      aria-label={ariaLabel ?? meta.label}
      className={cn(
        "inline-flex items-center justify-center rounded-full text-white",
        "font-display font-semibold leading-none flex-shrink-0",
        meta.gradient,
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
      }}
    >
      {meta.kind === "letter" ? (
        meta.initial
      ) : meta.kind === "house" ? (
        <Home strokeWidth={2.4} style={{ width: size * 0.5, height: size * 0.5 }} />
      ) : (
        <Users strokeWidth={2.4} style={{ width: size * 0.5, height: size * 0.5 }} />
      )}
    </span>
  );
}

interface Meta {
  label: string;
  gradient: string;
  kind: "letter" | "house" | "users";
  initial?: string;
}

const META: Record<AvatarWho, Meta> = {
  FRAN: { label: "Fran", gradient: "avatar-fran", kind: "letter", initial: "F" },
  SAM: { label: "Sam", gradient: "avatar-sam", kind: "letter", initial: "S" },
  HOUSEHOLD: { label: "Household", gradient: "avatar-house", kind: "house" },
  JOINT: { label: "Joint", gradient: "avatar-joint", kind: "users" },
};

/** Maps a `CashSource` to the Avatar identity used in flow diagrams. */
export function whoFromCashSource(source: CashSource): AvatarWho {
  if (source === "FRAN_PERSONAL") return "FRAN";
  if (source === "SAM_PERSONAL") return "SAM";
  return "JOINT";
}
