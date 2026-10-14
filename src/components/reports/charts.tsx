"use client";
import { useId, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatINR, formatINRShort } from "@/lib/money";
import { formatMinutes } from "@/lib/dates";
import { cn } from "@/lib/cn";

/*
 * Palettes validated with the dataviz validator (light surface + dark surface):
 *   in/out:      light #0d9488 / #e11d48, dark #0d9488 / #f0517a   (CVD ΔE ≥ 10)
 *   workspaces:  #059669 personal, #6366f1 MahiSys, #d97706 DSA      (both modes pass)
 *   categorical: #6d5df6 #059669 #d97706 #e11d48 #0284c7 #db2777 #65a30d (dark: #8b7dff first)
 *   GST:         brand violet (output) vs teal (input)
 * Colours live in CSS variables on the wrapper so dark mode swaps them in one place.
 */
const wrap = cn(
  "[--c-in:#0d9488] [--c-out:#e11d48] [--c-net:#6d5df6] dark:[--c-out:#f0517a] dark:[--c-net:#8b7dff]",
  "[--c-personal:#059669] [--c-mahisys:#6366f1] [--c-dsa:#d97706]",
  "[--k1:#6d5df6] [--k2:#059669] [--k3:#d97706] [--k4:#e11d48] [--k5:#0284c7] [--k6:#db2777] [--k7:#65a30d] [--k8:#9a97b5] dark:[--k1:#8b7dff] dark:[--k8:#706d96]",
);
const axis = { fontSize: 11, fill: "var(--fg-subtle)" };
const grid = <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />;
export const CATEGORY_COLORS = ["var(--k1)", "var(--k2)", "var(--k3)", "var(--k4)", "var(--k5)", "var(--k6)", "var(--k7)", "var(--k8)"];

function TipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="min-w-40 rounded-xl border border-line bg-solid px-3 py-2 text-xs shadow-pop">
      <div className="mb-1 font-bold text-fg">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 py-0.5 text-fg-muted">
          {r.color ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} /> : null}
          <span>{r.label}</span>
          <span className="ml-auto pl-3 font-bold tabular-nums text-fg">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function LegendRow({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-xs font-semibold text-fg-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.line ? <span className="h-0.5 w-4 rounded-full" style={{ background: i.color }} /> : <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} />}
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Grad({ id, color }: { id: string; color: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={1} />
      <stop offset="100%" stopColor={color} stopOpacity={0.55} />
    </linearGradient>
  );
}

/** Income vs expense bars per month with the net as a line — one axis (all rupees). */
export function PnlChart({ data }: { data: { label: string; income: number; expense: number; net: number }[] }) {
  const gid = useId().replace(/:/g, "");
  return (
    <div className={cn("w-full", wrap)}>
      <div className="h-72">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
            <defs>
              <Grad id={`in-${gid}`} color="var(--c-in)" />
              <Grad id={`out-${gid}`} color="var(--c-out)" />
            </defs>
            {grid}
            <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval={0} />
            <YAxis tick={axis} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => formatINRShort(v)} />
            <ReferenceLine y={0} stroke="var(--border-strong)" />
            <Tooltip
              cursor={{ fill: "var(--bg-muted)", opacity: 0.6 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as { income: number; expense: number; net: number };
                return (
                  <TipBox
                    title={String(label)}
                    rows={[
                      { label: "Income", value: formatINR(d.income, { whole: true }), color: "var(--c-in)" },
                      { label: "Expense", value: formatINR(d.expense, { whole: true }), color: "var(--c-out)" },
                      { label: "Net", value: formatINR(d.net, { whole: true }), color: "var(--c-net)" },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="income" fill={`url(#in-${gid})`} radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={800} />
            <Bar dataKey="expense" fill={`url(#out-${gid})`} radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={800} />
            <Line dataKey="net" type="monotone" stroke="var(--c-net)" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: "var(--bg-solid)" }} activeDot={{ r: 5 }} animationDuration={900} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <LegendRow
        items={[
          { label: "Income", color: "var(--c-in)" },
          { label: "Expense", color: "var(--c-out)" },
          { label: "Net", color: "var(--c-net)", line: true },
        ]}
      />
    </div>
  );
}

/** Donut with an interactive legend list. */
export function DonutChart({ slices, total }: { slices: { name: string; amountPaise: number; share: number }[]; total: number }) {
  const [active, setActive] = useState<number | null>(null);
  const shown = active == null ? null : slices[active];
  return (
    <div className={cn("grid items-center gap-6 sm:grid-cols-[minmax(0,240px)_1fr]", wrap)}>
      <div className="relative mx-auto h-56 w-56">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={slices}
              dataKey="amountPaise"
              nameKey="name"
              innerRadius="64%"
              outerRadius="100%"
              paddingAngle={slices.length > 1 ? 1.5 : 0}
              stroke="var(--bg-solid)"
              strokeWidth={2}
              cornerRadius={4}
              onMouseEnter={(_, i) => setActive(i)}
              onMouseLeave={() => setActive(null)}
              animationDuration={900}
            >
              {slices.map((s, i) => (
                <Cell key={s.name} fill={CATEGORY_COLORS[Math.min(i, CATEGORY_COLORS.length - 1)]} opacity={active == null || active === i ? 1 : 0.35} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="max-w-28 truncate text-[11px] font-semibold text-fg-subtle">{shown ? shown.name : "Total spent"}</div>
          <div className="text-xl font-extrabold tabular-nums text-fg">{formatINRShort(shown ? shown.amountPaise : total)}</div>
          {shown ? <div className="text-xs font-semibold text-fg-muted">{shown.share}%</div> : null}
        </div>
      </div>
      <ul className="space-y-1.5">
        {slices.map((s, i) => (
          <li
            key={s.name}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            className={cn("flex items-center gap-3 rounded-xl px-3 py-2 transition", active === i ? "bg-muted" : "hover:bg-muted/60")}
          >
            <span className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: CATEGORY_COLORS[Math.min(i, CATEGORY_COLORS.length - 1)] }} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{s.name}</span>
            <span className="text-xs tabular-nums text-fg-muted">{s.share}%</span>
            <span className="w-24 text-right text-sm font-bold tabular-nums text-fg">{formatINR(s.amountPaise, { whole: true })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Receivables by age — a single-hue (rose) sequential ramp: older = darker. */
export function AgeingChart({ data }: { data: { label: string; amountPaise: number }[] }) {
  const ramp = ["#94a3b8", "#fda4af", "#fb7185", "#e11d48", "#9f1239"];
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: 0 }} barCategoryGap="24%">
          {grid}
          <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={axis} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => formatINRShort(v)} />
          <Tooltip
            cursor={{ fill: "var(--bg-muted)", opacity: 0.6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as { label: string; amountPaise: number };
              return <TipBox title={d.label} rows={[{ label: "Outstanding", value: formatINR(d.amountPaise, { whole: true }) }]} />;
            }}
          />
          <Bar dataKey="amountPaise" radius={[4, 4, 0, 0]} maxBarSize={56} minPointSize={2} animationDuration={800} label={{ position: "top", fontSize: 11, fontWeight: 700, fill: "var(--fg)", formatter: (v: unknown) => (Number(v) ? formatINRShort(Number(v)) : "") }}>
            {data.map((d, i) => (
              <Cell key={d.label} fill={ramp[i] ?? ramp[ramp.length - 1]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Output vs input GST per month. */
export function GstChart({ data }: { data: { label: string; output: number; input: number }[] }) {
  const gid = useId().replace(/:/g, "");
  return (
    <div className={cn("w-full", wrap)}>
      <div className="h-64">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
            <defs>
              <Grad id={`o-${gid}`} color="var(--c-net)" />
              <Grad id={`i-${gid}`} color="var(--c-in)" />
            </defs>
            {grid}
            <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval={0} />
            <YAxis tick={axis} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => formatINRShort(v)} />
            <Tooltip
              cursor={{ fill: "var(--bg-muted)", opacity: 0.6 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as { output: number; input: number };
                return (
                  <TipBox
                    title={String(label)}
                    rows={[
                      { label: "Output GST", value: formatINR(d.output, { whole: true }), color: "var(--c-net)" },
                      { label: "Input credit", value: formatINR(d.input, { whole: true }), color: "var(--c-in)" },
                      { label: "Net payable", value: formatINR(d.output - d.input, { whole: true }) },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="output" fill={`url(#o-${gid})`} radius={[4, 4, 0, 0]} maxBarSize={20} animationDuration={800} />
            <Bar dataKey="input" fill={`url(#i-${gid})`} radius={[4, 4, 0, 0]} maxBarSize={20} animationDuration={800} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <LegendRow
        items={[
          { label: "Output GST (invoices)", color: "var(--c-net)" },
          { label: "Input GST (expenses)", color: "var(--c-in)" },
        ]}
      />
    </div>
  );
}

const WS = [
  { key: "personal", label: "Personal", color: "var(--c-personal)" },
  { key: "mahisys", label: "MahiSys", color: "var(--c-mahisys)" },
  { key: "dsa", label: "Loan DSA", color: "var(--c-dsa)" },
] as const;

/** Hours per week stacked by workspace, with a 2px surface gap between segments. */
export function TimeChart({ data }: { data: { label: string; personal: number; mahisys: number; dsa: number }[] }) {
  return (
    <div className={cn("w-full", wrap)}>
      <div className="h-64">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="26%">
            {grid}
            <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={axis} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => `${Math.round(v / 60)}h`} />
            <Tooltip
              cursor={{ fill: "var(--bg-muted)", opacity: 0.6 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as Record<string, number>;
                return (
                  <TipBox
                    title={`Week of ${label}`}
                    rows={[...WS.map((w) => ({ label: w.label, value: formatMinutes(d[w.key]), color: w.color })), { label: "Total", value: formatMinutes(d.personal + d.mahisys + d.dsa) }]}
                  />
                );
              }}
            />
            {WS.map((w, i) => (
              <Bar key={w.key} dataKey={w.key} stackId="t" fill={w.color} stroke="var(--bg-solid)" strokeWidth={1} radius={i === WS.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} animationDuration={800} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <LegendRow items={WS.map((w) => ({ label: w.label, color: w.color }))} />
    </div>
  );
}

/** Actual ÷ estimate per task type; the 1× line is "spot on". */
export function EstimateChart({ data }: { data: { taskType: string; ratio: number; tasks: number }[] }) {
  const height = Math.max(140, data.length * 40 + 24);
  return (
    <div className={cn("w-full", wrap)} style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 4 }} barCategoryGap={10}>
          <XAxis type="number" hide domain={[0, (max: number) => Math.max(1.5, Math.ceil(max * 10) / 10)]} />
          <YAxis type="category" dataKey="taskType" width={110} tick={axis} axisLine={false} tickLine={false} />
          <ReferenceLine x={1} stroke="var(--fg-subtle)" strokeDasharray="4 4" label={{ value: "spot on", position: "top", fontSize: 10, fill: "var(--fg-subtle)" }} />
          <Tooltip
            cursor={{ fill: "var(--bg-muted)", opacity: 0.6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as { taskType: string; ratio: number; tasks: number };
              return <TipBox title={d.taskType} rows={[{ label: "Actual ÷ estimate", value: `${d.ratio}×` }, { label: "Tasks", value: String(d.tasks) }]} />;
            }}
          />
          <Bar dataKey="ratio" radius={[0, 4, 4, 0]} maxBarSize={22} animationDuration={800} label={{ position: "right", fontSize: 11, fontWeight: 700, fill: "var(--fg)", formatter: (v: unknown) => `${v}×` }}>
            {data.map((d) => (
              <Cell key={d.taskType} fill={d.ratio > 1.15 ? "var(--c-out)" : d.ratio < 0.85 ? "var(--k5)" : "var(--c-in)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

