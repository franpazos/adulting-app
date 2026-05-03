import { cn } from "@/lib/utils/cn";
import type { ComponentPropsWithoutRef } from "react";

export function Skeleton({
  className,
  ...rest
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "rounded-xl bg-surface-2 animate-pulse",
        className,
      )}
      {...rest}
    />
  );
}
