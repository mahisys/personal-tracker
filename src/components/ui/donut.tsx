"use client";
import { useState } from "react";

export type DonutSlice = { name: string; value: number; color: string };

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
}

/**
 * Animated donut drawn with plain SVG strokes, so slice colours (including CSS variables) always apply.
 * Hovering a slice dims the others and reports it through onActive.
 */
export function Donut({ slices, size = 208, thickness = 30, gapDeg = 2.5, onActive }: { slices: DonutSlice[]; size?: number; thickness?: number; gapDeg?: number; onActive?: (i: number | null) => void }) {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const gap = slices.length > 1 ? (gapDeg * Math.PI) / 180 : 0;
  const starts = slices.map((_, i) => -Math.PI / 2 + slices.slice(0, i).reduce((t, x) => t + (Math.max(0, x.value) / total) * Math.PI * 2, 0));
  const set = (i: number | null) => {
    setActive(i);
    onActive?.(i);
  };
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full" role="img" aria-label={slices.map((s) => s.name).join(", ")}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--bg-muted)" strokeWidth={thickness} />
      {slices.map((s, i) => {
        const sweep = (Math.max(0, s.value) / total) * Math.PI * 2;
        const a0 = starts[i] + gap / 2;
        const a1 = Math.max(a0 + 0.001, starts[i] + sweep - gap / 2);
        const full = slices.length === 1;
        return (
          <path
            key={s.name}
            d={full ? arc(c, c, r, -Math.PI / 2, (3 * Math.PI) / 2 - 0.0001) : arc(c, c, r, a0, a1)}
            fill="none"
            stroke={s.color}
            strokeWidth={active === i ? thickness + 4 : thickness}
            strokeLinecap="butt"
            opacity={active == null || active === i ? 1 : 0.35}
            className="cursor-pointer transition-all duration-300 animate-pop-in"
            style={{ animationDelay: `${i * 60}ms`, transformOrigin: "center" }}
            onMouseEnter={() => set(i)}
            onMouseLeave={() => set(null)}
          >
            <title>{s.name}</title>
          </path>
        );
      })}
    </svg>
  );
}
