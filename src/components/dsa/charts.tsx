"use client";
import { useId } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR, formatINRShort } from "@/lib/money";
import { formatMonth } from "@/lib/dates";
import { cn } from "@/lib/cn";

/*
 * Two validated series colours (amber = DSA accent, violet = brand), stepped per theme:
 * light #d97706 / #6d5df6, dark #e08a0b / #8b7dff — set as CSS variables on the chart wrapper.
 */
const wrap = "[--dsa-c1:#d97706] [--dsa-c2:#6d5df6] dark:[--dsa-c1:#e08a0b] dark:[--dsa-c2:#8b7dff]";
const C1 = "var(--dsa-c1)";
const C2 = "var(--dsa-c2)";
const axis = { fontSize: 11, fill: "var(--fg-subtle)" };

function TipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-xl border border-line bg-solid px-3 py-2 text-xs shadow-pop">
      <div className="mb-1 font-bold text-fg">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-fg-muted">
          {r.color ? <span className="h-2 w-2 rounded-full" style={{ background: r.color }} /> : null}
          <span>{r.label}</span>
          <span className="ml-auto pl-3 font-bold tabular-nums text-fg">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Lead → logged in → sanctioned → disbursed. */
export function FunnelChart({ data }: { data: { label: string; count: number; pct: number }[] }) {
  const gid = useId().replace(/:/g, "");
  return (
    <div className={cn("h-56 w-full", wrap)}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} barCategoryGap={10}>
          <defs>
            <linearGradient id={`f-${gid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={C1} stopOpacity={0.55} />
              <stop offset="100%" stopColor={C1} stopOpacity={1} />
            </linearGradient>
          </defs>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={84} tick={axis} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "var(--bg-muted)", opacity: 0.6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as { label: string; count: number; pct: number };
              return <TipBox title={d.label} rows={[{ label: "Files", value: String(d.count) }, { label: "Of all leads", value: `${d.pct}%` }]} />;
            }}
          />
          <Bar dataKey="count" fill={`url(#f-${gid})`} radius={[0, 6, 6, 0]} minPointSize={3} isAnimationActive animationDuration={900}>
            <LabelList dataKey="count" position="right" formatter={(v: unknown) => String(v)} style={{ fontSize: 12, fontWeight: 700, fill: "var(--fg)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Approval rate per lender (sanctioned ÷ decided). */
export function ApprovalChart({ data }: { data: { name: string; rate: number; approved: number; decided: number }[] }) {
  const gid = useId().replace(/:/g, "");
  const height = Math.max(120, data.length * 38 + 16);
  return (
    <div className={cn("w-full", wrap)} style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 4 }} barCategoryGap={10}>
          <defs>
            <linearGradient id={`a-${gid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={C1} stopOpacity={0.5} />
              <stop offset="100%" stopColor={C1} stopOpacity={1} />
            </linearGradient>
          </defs>
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis type="category" dataKey="name" width={96} tick={axis} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "var(--bg-muted)", opacity: 0.6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as { name: string; rate: number; approved: number; decided: number };
              return <TipBox title={d.name} rows={[{ label: "Approval rate", value: `${d.rate}%` }, { label: "Sanctioned / decided", value: `${d.approved} / ${d.decided}` }]} />;
            }}
          />
          <Bar dataKey="rate" radius={[0, 6, 6, 0]} minPointSize={3} animationDuration={900}>
            {data.map((d) => (
              <Cell key={d.name} fill={`url(#a-${gid})`} />
            ))}
            <LabelList dataKey="rate" position="right" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 12, fontWeight: 700, fill: "var(--fg)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Gross commission vs what you keep (after TDS and partner share), by disbursal month. */
export function EarningsChart({ data }: { data: { month: string; gross: number; net: number }[] }) {
  const gid = useId().replace(/:/g, "");
  return (
    <div className={cn("h-72 w-full", wrap)}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`g1-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C1} stopOpacity={0.35} />
              <stop offset="100%" stopColor={C1} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`g2-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C2} stopOpacity={0.3} />
              <stop offset="100%" stopColor={C2} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tickFormatter={(m: string) => formatMonth(m).slice(0, 3)} tick={axis} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tickFormatter={(v: number) => formatINRShort(v)} tick={axis} axisLine={false} tickLine={false} width={52} />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as { gross: number; net: number };
              return (
                <TipBox
                  title={formatMonth(String(label))}
                  rows={[
                    { label: "Gross commission", value: formatINR(d.gross, { whole: true }), color: C1 },
                    { label: "In hand", value: formatINR(d.net, { whole: true }), color: C2 },
                  ]}
                />
              );
            }}
          />
          <Legend
            verticalAlign="top"
            height={28}
            iconType="circle"
            iconSize={8}
            formatter={(v: string) => <span className="text-xs font-semibold text-fg-muted">{v}</span>}
          />
          <Area type="monotone" name="Gross commission" dataKey="gross" stroke={C1} strokeWidth={2} fill={`url(#g1-${gid})`} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--bg-solid)" }} animationDuration={1000} />
          <Area type="monotone" name="In hand (after TDS & partner share)" dataKey="net" stroke={C2} strokeWidth={2} fill={`url(#g2-${gid})`} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--bg-solid)" }} animationDuration={1000} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
