"use client";
import { useId } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR, formatINRShort } from "@/lib/money";
import { formatDay } from "@/lib/dates";
import type { ForecastDay } from "@/server/planner/forecast-core";

const RED = "#f43f5e";

/**
 * Projected balance as a smooth area. The line and fill turn rose below the safety threshold,
 * which is drawn as a dashed line; the lowest point is marked.
 */
export function ForecastChart({ days, minBalancePaise, lowest }: { days: ForecastDay[]; minBalancePaise: number; lowest: { date: string; balancePaise: number } }) {
  const id = useId().replace(/:/g, "");
  const values = days.map((d) => d.balancePaise);
  const max = Math.max(...values, minBalancePaise);
  const min = Math.min(...values, minBalancePaise, 0);
  const range = max - min || 1;
  const pad = Math.max(range * 0.08, 100_00);
  // SVG gradients are relative to each shape's bounding box: the line spans the data's min–max,
  // the fill spans the data and the zero baseline. Where the threshold falls in each, colour turns rose.
  const dMax = Math.max(...values);
  const dMin = Math.min(...values);
  const frac = (top: number, bottom: number) => (top === bottom ? (top >= minBalancePaise ? 1 : 0) : Math.min(1, Math.max(0, (top - minBalancePaise) / (top - bottom))));
  const split = frac(dMax, dMin);
  const fillSplit = frac(Math.max(dMax, 0), Math.min(dMin, 0));

  return (
    <div className="h-64 w-full sm:h-72" role="img" aria-label={`Projected balance; lowest ${formatINR(lowest.balancePaise, { whole: true })} on ${formatDay(lowest.date)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={days} margin={{ top: 16, right: 8, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={`fc-stroke-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="var(--brand)" />
              <stop offset={split} stopColor="var(--brand)" />
              <stop offset={split} stopColor={RED} />
              <stop offset={1} stopColor={RED} />
            </linearGradient>
            <linearGradient id={`fc-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="var(--brand)" stopOpacity={0.32} />
              <stop offset={fillSplit} stopColor="var(--brand)" stopOpacity={0.06} />
              <stop offset={fillSplit} stopColor={RED} stopOpacity={0.1} />
              <stop offset={1} stopColor={RED} stopOpacity={0.28} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "var(--fg-subtle)", fontSize: 11 }} tickFormatter={(d: string) => formatDay(d, { short: true })} minTickGap={36} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--fg-subtle)", fontSize: 11 }} width={52} tickFormatter={(v: number) => formatINRShort(v)} domain={[min - pad, max + pad]} />
          <ReferenceLine y={minBalancePaise} stroke={RED} strokeOpacity={0.7} strokeDasharray="5 5" label={{ value: `Cushion ${formatINRShort(minBalancePaise)}`, position: "insideTopRight", fill: "var(--fg-muted)", fontSize: 11 }} />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as ForecastDay;
              return (
                <div className="max-w-64 rounded-xl border border-line bg-solid px-3 py-2 text-xs shadow-pop">
                  <div className="font-bold text-fg">{formatDay(d.date)}</div>
                  <div className={d.balancePaise < minBalancePaise ? "font-semibold text-rose-600 dark:text-rose-400" : "font-semibold text-fg"}>Balance {formatINR(d.balancePaise, { whole: true })}</div>
                  {d.items.length ? (
                    <ul className="mt-1.5 space-y-0.5 border-t border-line pt-1.5">
                      {d.items.slice(0, 5).map((it, i) => (
                        <li key={`${it.id}-${i}`} className="flex justify-between gap-3">
                          <span className="truncate text-fg-muted">{it.label}</span>
                          <span className={it.kind === "bill" ? "tabular-nums text-rose-600 dark:text-rose-400" : "tabular-nums text-emerald-600 dark:text-emerald-400"}>
                            {it.kind === "bill" ? "−" : "+"}
                            {formatINRShort(it.amountPaise)}
                          </span>
                        </li>
                      ))}
                      {d.items.length > 5 ? <li className="text-fg-subtle">+{d.items.length - 5} more</li> : null}
                    </ul>
                  ) : null}
                </div>
              );
            }}
          />
          <Area type="monotone" dataKey="balancePaise" stroke={`url(#fc-stroke-${id})`} strokeWidth={2.25} fill={`url(#fc-fill-${id})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--bg-solid)", fill: "var(--brand)" }} animationDuration={900} />
          <ReferenceDot x={lowest.date} y={lowest.balancePaise} r={5} fill={lowest.balancePaise < minBalancePaise ? RED : "var(--brand)"} stroke="var(--bg-solid)" strokeWidth={2} label={{ value: `Low ${formatINRShort(lowest.balancePaise)}`, position: "bottom", fill: "var(--fg-muted)", fontSize: 11, fontWeight: 700 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
