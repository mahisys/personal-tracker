"use client";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Hourglass, X } from "lucide-react";
import { toast } from "sonner";
import { reviseEstimate } from "@/server/tasks/actions";
import type { Overrun } from "@/server/tasks/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { formatMinutes } from "@/lib/dates";
import { onOverrun } from "./events";

const noop = () => () => {};

/** Gentle "that took longer than planned — revise the estimate?" sheet. Mount once per page. */
export function OverrunPrompt() {
  const [o, setO] = useState<Overrun | null>(null);
  const [h, setH] = useState("0");
  const [m, setM] = useState("0");
  const [pending, start] = useTransition();
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  useEffect(
    () =>
      onOverrun((next) => {
        // Suggest the actual time, rounded up to the next 15 minutes
        const suggested = Math.ceil(next.actualMinutes / 15) * 15;
        setH(String(Math.floor(suggested / 60)));
        setM(String(suggested % 60));
        setO(next);
      }),
    [],
  );

  if (!mounted) return null;
  const close = () => setO(null);
  const ratio = o ? o.actualMinutes / o.estimateMinutes : 1;

  return createPortal(
    <AnimatePresence>
      {o ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div className="absolute inset-0 bg-[#0b0c1d]/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="overrun-title"
            className="relative z-10 w-full rounded-t-3xl border border-line bg-solid p-6 shadow-pop sm:max-w-md sm:rounded-3xl"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <button type="button" onClick={close} className="absolute right-4 top-4 rounded-full p-1.5 text-fg-subtle hover:bg-muted hover:text-fg" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-600 dark:text-amber-300">
              <Hourglass className="h-6 w-6" />
            </div>
            <h2 id="overrun-title" className="text-lg font-extrabold text-fg">
              That took a little longer than planned
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              <span className="font-semibold text-fg">{o.title}</span> — planned {formatMinutes(o.estimateMinutes)}, logged {formatMinutes(o.actualMinutes)} ({ratio.toFixed(1)}×). Totally normal. Want to
              update the estimate so your ETAs stay honest?
            </p>
            <form
              className="mt-5"
              onSubmit={(e) => {
                e.preventDefault();
                const minutes = Number(h || 0) * 60 + Number(m || 0);
                if (!(minutes > 0)) return toast.error("Enter the new estimate");
                start(async () => {
                  const r = await reviseEstimate(o.taskId, minutes, true);
                  if (r.ok) {
                    toast.success(r.message);
                    close();
                  } else toast.error(r.error);
                });
              }}
            >
              <div className="flex items-center gap-2">
                <Input type="number" min={0} inputMode="numeric" value={h} onChange={(e) => setH(e.target.value)} aria-label="Hours" className="w-20 text-center" />
                <span className="text-sm font-semibold text-fg-muted">h</span>
                <Input type="number" min={0} max={59} step={5} inputMode="numeric" value={m} onChange={(e) => setM(e.target.value)} aria-label="Minutes" className="w-20 text-center" />
                <span className="text-sm font-semibold text-fg-muted">m</span>
              </div>
              <p className="mt-2 text-xs text-fg-subtle">Your original estimate is kept in history, so accuracy stats stay true. Repeating tasks pick up the new estimate too.</p>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={close}>
                  Keep as is
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Update estimate"}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
