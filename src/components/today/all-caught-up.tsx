"use client";
import { useEffect } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { PartyPopper, Sparkles } from "lucide-react";

const SPARKS = [
  { x: -90, y: -40, d: 0, s: 1 },
  { x: 95, y: -50, d: 0.3, s: 0.8 },
  { x: -70, y: 45, d: 0.6, s: 0.7 },
  { x: 80, y: 40, d: 0.9, s: 1.1 },
  { x: 0, y: -75, d: 1.2, s: 0.9 },
];

/** Celebratory empty state for the "Needs you" list. */
export function AllCaughtUp({ doneToday }: { doneToday: number }) {
  useEffect(() => {
    // A tiny one-time burst the first time it's seen today
    try {
      const key = `cc-caught-up-${new Date().toDateString()}`;
      if (doneToday > 0 && !localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        import("@/components/client/celebrate").then((m) => m.celebrate());
      }
    } catch {
      /* storage unavailable — skip the burst */
    }
  }, [doneToday]);

  return (
    <div className="glass relative flex flex-col items-center overflow-hidden rounded-[var(--radius-card)] border border-line px-6 py-12 text-center shadow-card">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgb(16_185_129/0.12),transparent_60%)]" />
      <div className="relative mb-5 flex h-20 w-20 items-center justify-center">
        {SPARKS.map((s, i) => (
          <motion.span
            key={i}
            className="absolute text-amber-400"
            initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0], x: s.x, y: s.y, scale: [0, s.s, 0] }}
            transition={{ duration: 2.2, delay: s.d, repeat: Infinity, repeatDelay: 1.6, ease: "easeOut" }}
          >
            <Sparkles className="h-4 w-4 fill-current" />
          </motion.span>
        ))}
        <motion.div
          initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 14 }}
          className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[linear-gradient(135deg,#10b981,#22c1a3)] text-white shadow-[0_16px_40px_-12px_#10b981]"
        >
          <PartyPopper className="h-9 w-9" />
        </motion.div>
      </div>
      <h3 className="relative text-xl font-extrabold text-fg">All caught up 🎉</h3>
      <p className="relative mt-1 max-w-sm text-sm text-fg-muted">
        {doneToday > 0 ? `You cleared ${doneToday} task${doneToday === 1 ? "" : "s"} today. Nothing else needs you right now — enjoy the calm.` : "Nothing needs you right now. Enjoy the calm, or get a head start on tomorrow."}
      </p>
      <div className="relative mt-5 flex flex-wrap justify-center gap-2">
        <Link href="/tasks" className="rounded-full bg-brand-soft px-4 py-2 text-sm font-bold text-brand transition hover:bg-brand/15">
          Look ahead
        </Link>
        <Link href="/projects" className="rounded-full bg-muted px-4 py-2 text-sm font-bold text-fg-muted transition hover:text-fg">
          Projects
        </Link>
      </div>
    </div>
  );
}
