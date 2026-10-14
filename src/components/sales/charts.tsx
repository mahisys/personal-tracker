"use client";
import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR, formatINRShort } from "@/lib/money";
import { formatMonth } from "@/lib/dates";

type Tokens = { brand: string; good: string; grid: string; muted: string; surface: string; fg: string };
const DEFAULT_TOKENS: Tokens = { brand: "#6d5df6", good: "#059669", grid: "rgba(120,112,200,.14)", muted: "#9a97b5", surface: "#ffffff", fg: "#1d1b3a" };

/** Reads chart colours from the design tokens and follows the light/dark switch. */
function useTokens(): Tokens {
  const read = (): Tokens => {
    const cs = getComputedStyle(document.documentElement);
    const dark = document.documentElement.classList.contains("dark");
    const v = (k: string, f: string) => cs.getPropertyValue(k).trim() || f;
    return {
      brand: v("--brand", "#6d5df6"),
      good: dark ? "#10b981" : "#059669",
      grid: v("--border", "rgba(120,112,200,.14)"),
      muted: v("--fg-subtle", "#9a97b5"),
      surface: v("--bg-solid", "#ffffff"),
      fg: v("--fg", "#1d1b3a"),
    };
  };
  const [t, setT] = useState<Tokens>(DEFAULT_TOKENS);
  useEffect(() => {
    setT(read());
    const obs = new MutationObserver(() => setT(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return t;
}

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: number; color: string }[] }) {
  return (
    <div className="rounded-xl border border-line bg-solid px-3 py-2 text-xs shadow-pop">
      <div className="mb-1 font-bold text-fg">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-fg-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
            {r.label}
          </span>
          <span className="font-semibold tabular-nums text-fg">{formatINR(r.value, { whole: true })}</span>
        </div>
      ))}
    </div>
  );
}

/** 12-month invoiced vs collected, one shared rupee axis. */
export function RevenueChart({ data }: { data: { month: string; label: string; invoiced: number; collected: number }[] }) {
  const t = useTokens();
  const empty = data.every((d) => d.invoiced === 0 && d.collected === 0);
  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs font-semibold text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.brand }} /> Invoiced
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.good }} /> Collected
        </span>
      </div>
      <div className="relative h-64">
        {empty ? <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-fg-subtle">Your first invoice will start this chart ✨</div> : null}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="g-invoiced" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={t.brand} stopOpacity={0.32} />
                <stop offset="100%" stopColor={t.brand} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="g-collected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={t.good} stopOpacity={0.22} />
                <stop offset="100%" stopColor={t.good} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={t.grid} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: t.muted, fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tickLine={false} axisLine={false} width={52} tick={{ fill: t.muted, fontSize: 11 }} tickFormatter={(v: number) => formatINRShort(v)} />
            <Tooltip
              cursor={{ stroke: t.muted, strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof data)[number];
                return (
                  <TooltipBox
                    title={formatMonth(p.month)}
                    rows={[
                      { label: "Invoiced", value: p.invoiced, color: t.brand },
                      { label: "Collected", value: p.collected, color: t.good },
                    ]}
                  />
                );
              }}
            />
            <Area type="monotone" dataKey="invoiced" stroke={t.brand} strokeWidth={2} fill="url(#g-invoiced)" activeDot={{ r: 5, stroke: t.surface, strokeWidth: 2 }} />
            <Area type="monotone" dataKey="collected" stroke={t.good} strokeWidth={2} fill="url(#g-collected)" activeDot={{ r: 5, stroke: t.surface, strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Open pipeline value per stage, horizontal bars. */
export function PipelineBars({ data }: { data: { name: string; count: number; valuePaise: number; weightedPaise: number }[] }) {
  const t = useTokens();
  const height = Math.max(160, data.length * 44);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap={10}>
          <defs>
            <linearGradient id="g-bar" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={t.brand} stopOpacity={0.55} />
              <stop offset="100%" stopColor={t.brand} stopOpacity={1} />
            </linearGradient>
          </defs>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={104} tickLine={false} axisLine={false} tick={{ fill: t.muted, fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: t.grid }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof data)[number];
              return (
                <div className="rounded-xl border border-line bg-solid px-3 py-2 text-xs shadow-pop">
                  <div className="font-bold text-fg">{p.name}</div>
                  <div className="text-fg-muted">
                    {p.count} lead{p.count === 1 ? "" : "s"} · <span className="font-semibold text-fg">{formatINR(p.valuePaise, { whole: true })}</span>
                  </div>
                  <div className="text-fg-muted">Weighted {formatINR(p.weightedPaise, { whole: true })}</div>
                </div>
              );
            }}
          />
          <Bar
            dataKey="valuePaise"
            radius={[0, 4, 4, 0]}
            fill="url(#g-bar)"
            label={{ position: "right", fill: t.fg, fontSize: 11, fontWeight: 700, formatter: (v: unknown) => formatINRShort(Number(v)) }}
            minPointSize={3}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
