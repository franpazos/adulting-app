import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { IconButton } from "./IconButton";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** "bottom" = mobile drawer; "center" = modal */
  side?: "bottom" | "center";
  className?: string;
}

/**
 * Mobile-first bottom sheet (also supports "center" modal on desktop).
 * Uses Radix Dialog under the hood for a11y.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = "bottom",
  className,
}: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in data-[state=closed]:fade-out",
          )}
        />
        <Dialog.Content
          className={cn(
            "fixed z-50 bg-surface text-text-primary shadow-card-dark",
            "outline-none focus-visible:outline-none",
            side === "bottom" &&
              [
                "inset-x-0 bottom-0 rounded-t-3xl",
                "max-h-[90dvh] overflow-y-auto",
                "pb-safe-bottom",
                "data-[state=open]:animate-in data-[state=closed]:animate-out",
                "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
              ].join(" "),
            side === "center" &&
              [
                "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
                "w-[min(92vw,420px)] rounded-3xl border border-border",
              ].join(" "),
            className,
          )}
        >
          {side === "bottom" && (
            <div className="flex justify-center pt-2">
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </div>
          )}
          <div className="px-5 pt-4 pb-5">
            {(title || description) && (
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  {title && (
                    <Dialog.Title className="h-section">{title}</Dialog.Title>
                  )}
                  {description && (
                    <Dialog.Description className="t-label mt-1">
                      {description}
                    </Dialog.Description>
                  )}
                </div>
                <Dialog.Close asChild>
                  <IconButton variant="ghost" size="sm" aria-label="Close">
                    <X className="size-4" />
                  </IconButton>
                </Dialog.Close>
              </div>
            )}
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
