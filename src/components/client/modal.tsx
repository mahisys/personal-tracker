"use client";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { ModalCloseContext } from "./action-form";

/**
 * A trigger button that opens an animated dialog (a bottom sheet on phones).
 * An <ActionForm> inside closes the modal automatically on success.
 */
export function Modal({
  trigger,
  title,
  description,
  children,
  variant = "primary",
  size = "md",
  triggerClassName,
  wide,
  defaultOpen = false,
}: {
  trigger: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  triggerClassName?: string;
  wide?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass(variant, size, triggerClassName)}>
        {trigger}
      </button>
      {mounted
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
                  <motion.div
                    className="absolute inset-0 bg-[#0b0c1d]/40 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setOpen(false)}
                  />
                  <motion.div
                    role="dialog"
                    aria-modal="true"
                    className={cn(
                      "relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-solid shadow-pop sm:rounded-3xl",
                      wide ? "sm:max-w-3xl" : "sm:max-w-lg",
                    )}
                    initial={{ opacity: 0, y: 40, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 30, scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  >
                    <div className="flex items-start justify-between gap-4 border-b border-line px-6 pb-4 pt-5">
                      <div>
                        <h2 className="text-lg font-extrabold text-fg">{title}</h2>
                        {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
                      </div>
                      <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-fg-subtle transition hover:bg-muted hover:text-fg" aria-label="Close">
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="overflow-y-auto px-6 py-5">
                      <ModalCloseContext.Provider value={() => setOpen(false)}>{children}</ModalCloseContext.Provider>
                    </div>
                  </motion.div>
                </div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}

/** Standard footer row for forms inside a modal. */
export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>;
}
