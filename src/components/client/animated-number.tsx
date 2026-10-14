"use client";
import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "motion/react";
import { formatINR, formatINRShort } from "@/lib/money";

/** Counts up to a value when it scrolls into view. format: "inr" | "inr-short" | "number" | "percent" */
export function AnimatedNumber({ value, format = "number", className }: { value: number; format?: "inr" | "inr-short" | "number" | "percent"; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, value, { duration: 1.1, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => setShown(v) });
    return () => c.stop();
  }, [inView, value]);
  const v = Math.round(shown);
  const text =
    format === "inr" ? formatINR(v, { whole: true }) : format === "inr-short" ? formatINRShort(v) : format === "percent" ? `${v}%` : v.toLocaleString("en-IN");
  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}
