"use client";
import { Fragment, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, ChevronRight, CircleAlert, Loader2 } from "lucide-react";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

export type RunRow = {
  id: string;
  trigger: string;
  startedLabel: string;
  duration: string | null;
  ok: boolean | null;
  alerts: number;
  tasks: number;
  pushLabel: string | null;
  rules: { key: string; name: string; ok: boolean; summary: string; ms: number }[];
  disabled: string[];
};

export function RunHistory({ runs }: { runs: RunRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <TableWrap>
      <Table className="min-w-[560px]">
        <THead>
          <tr>
            <TH className="w-8" />
            <TH>When</TH>
            <TH>Trigger</TH>
            <TH>Result</TH>
            <TH className="text-right">Alerts</TH>
            <TH className="text-right">Tasks</TH>
            <TH className="text-right">Took</TH>
          </tr>
        </THead>
        <tbody>
          {runs.map((r) => {
            const open = openId === r.id;
            return (
              <Fragment key={r.id}>
                <TR className="cursor-pointer" onClick={() => setOpenId(open ? null : r.id)}>
                  <TD>
                    <button type="button" aria-expanded={open} aria-label={open ? "Hide details" : "Show details"} className="flex h-6 w-6 items-center justify-center rounded-md text-fg-subtle hover:bg-muted">
                      <ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
                    </button>
                  </TD>
                  <TD className="whitespace-nowrap font-semibold">{r.startedLabel}</TD>
                  <TD>
                    <Badge tone={r.trigger === "manual" ? "violet" : "neutral"}>{r.trigger === "manual" ? "Run now" : r.trigger === "cron" ? "Scheduled" : r.trigger}</Badge>
                  </TD>
                  <TD>
                    {r.ok == null ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running
                      </span>
                    ) : r.ok ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" /> All good
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-bad">
                        <CircleAlert className="h-4 w-4" /> Needs a look
                      </span>
                    )}
                  </TD>
                  <TD className="text-right tabular-nums">{r.alerts}</TD>
                  <TD className="text-right tabular-nums">{r.tasks}</TD>
                  <TD className="text-right text-xs tabular-nums text-fg-muted">{r.duration ?? "—"}</TD>
                </TR>
                <AnimatePresence initial={false}>
                  {open ? (
                    <tr>
                      <td colSpan={7} className="border-b border-line bg-muted/40 p-0">
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <ul className="grid gap-1.5 px-6 py-4 sm:grid-cols-2">
                            {r.rules.map((x) => (
                              <li key={x.key} className="flex items-start gap-2 text-xs">
                                {x.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bad" />}
                                <span>
                                  <span className="font-bold text-fg">{x.name}</span>
                                  <span className={cn("ml-1.5", x.ok ? "text-fg-muted" : "text-bad")}>{x.summary}</span>
                                  <span className="ml-1.5 text-fg-subtle tabular-nums">{x.ms} ms</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                          <div className="flex flex-wrap gap-x-6 gap-y-1 px-6 pb-4 text-xs text-fg-muted">
                            {r.pushLabel ? <span>Push: {r.pushLabel}</span> : null}
                            {r.disabled.length ? <span>Paused: {r.disabled.join(", ")}</span> : null}
                          </div>
                        </motion.div>
                      </td>
                    </tr>
                  ) : null}
                </AnimatePresence>
              </Fragment>
            );
          })}
        </tbody>
      </Table>
    </TableWrap>
  );
}
