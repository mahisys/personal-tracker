"use client";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { ModalCloseContext } from "@/components/client/action-form";
import { cn } from "@/lib/cn";

const noopSubscribe = () => () => {};

/**
 * A controlled dialog (bottom sheet on phones) — like <Modal> but opened from code, e.g. after a
 * card is dropped on a column that needs more details. An <ActionForm> inside closes it on success.
 */
export function Dialog({ open, onClose, title, description, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; wide?: boolean }) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div className="absolute inset-0 bg-[#0b0c1d]/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn("relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-solid shadow-pop sm:rounded-3xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
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
              <button type="button" onClick={onClose} className="rounded-full p-1.5 text-fg-subtle transition hover:bg-muted hover:text-fg" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5">
              <ModalCloseContext.Provider value={onClose}>{children}</ModalCloseContext.Provider>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
