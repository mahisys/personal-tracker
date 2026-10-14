"use client";
import confetti from "canvas-confetti";

/** A short, cheerful confetti burst. */
export function celebrate() {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#6d5df6", "#4f7cff", "#22c1a3", "#fbbf24", "#f472b6"];
  confetti({ particleCount: 70, spread: 70, startVelocity: 38, origin: { y: 0.7 }, colors, scalar: 0.9, ticks: 180 });
  setTimeout(() => confetti({ particleCount: 40, angle: 60, spread: 55, origin: { x: 0, y: 0.75 }, colors }), 120);
  setTimeout(() => confetti({ particleCount: 40, angle: 120, spread: 55, origin: { x: 1, y: 0.75 }, colors }), 220);
}
