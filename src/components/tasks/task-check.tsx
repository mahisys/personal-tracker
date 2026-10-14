"use client";
import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { toggleTaskDone } from "@/server/tasks/actions";
import { cn } from "@/lib/cn";
import { priorityMeta } from "./meta";
import { handleResult } from "./events";

/**
 * The round "complete" checkbox. Ticks instantly with a springy check, waits a beat so the
 * animation can be enjoyed, then saves (confetti + toast come from the server result).
 */
export function TaskCheck({
  id,
  done,
  priority = 3,
  size = "md",
  label,
  onChange,
}: {
  id: string;
  done: boolean;
  priority?: number;
  size?: "sm" | "md" | "lg";
  label?: string;
  onChange?: (done: boolean) => void;
}) {
  const [checked, setChecked] = useState(done);
  const [syncedDone, setSyncedDone] = useState(done);
  const [pending, start] = useTransition();
  if (syncedDone !== done) {
    setSyncedDone(done);
    setChecked(done);
  }

  const dim = { sm: "h-[18px] w-[18px]", md: "h-[22px] w-[22px]", lg: "h-7 w-7" }[size];
  const ring = priorityMeta(priority).ring;

  function toggle() {
    if (pending) return;
    const next = !checked;
    setChecked(next);
    onChange?.(next);
    start(async () => {
      await new Promise((r) => setTimeout(r, next ? 420 : 0));
      const r = await toggleTaskDone(id, next);
      if (!handleResult(r)) {
        setChecked(!next);
        onChange?.(!next);
      }
    });
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? (checked ? "Mark as not done" : "Mark as done")}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}
      className={cn(
        "group/check relative flex shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20",
        dim,
        checked ? "border-emerald-500 bg-emerald-500" : cn(ring, "bg-solid hover:bg-emerald-500/10"),
      )}
    >
      {/* soft burst ring when ticking */}
      {checked ? (
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-emerald-400"
          initial={{ scale: 1, opacity: 0.8 }}
          animate={{ scale: 2.1, opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        />
      ) : null}
      <svg viewBox="0 0 24 24" className="h-[70%] w-[70%]" fill="none" aria-hidden>
        {/* faint hint on hover while unticked */}
        {!checked ? (
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 opacity-0 transition-opacity group-hover/check:opacity-40" />
        ) : null}
        <motion.path
          d="M5 12.5l4.5 4.5L19 7.5"
          stroke="white"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.32, ease: "easeOut" }}
        />
      </svg>
    </button>
  );
}
