"use client";
import { useId } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR, formatINRShort } from "@/lib/money";
import { formatDay, formatMonth } from "@/lib/dates";

const IN = "#10b981";
const OUT = "#f43f5e";

/** Fixed categorical order for category breakdowns (never cycled — the tail folds into "Other"). */
export const CATEGORY_COLORS = ["#6d5df6", "#4f7cff", "#22c1a3", "#f59e0b", "#ec4899", "#0ea5e9"];
export const OTHER_COLOR = "#9a97b5";

function TooltipCard({ title, rows }: { title: string; rows: { label: string; value: number; color: string }[] }) {
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

const axisTick = { fill: "var(--fg-subtle)", fontSize: 11 };

/** Income vs expense per month: rounded paired bars. */
export function IncomeExpenseChart({ data }: { data: { month: string; incomePaise: number; expensePaise: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: formatMonth(d.month).slice(0, 3) }));
  return (
    <div className="h-64 w-full" role="img" aria-label="Income and expense for the last six months">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
          <YAxis tickLine={false} axisLine={false} tick={axisTick} width={52} tickFormatter={(v: number) => formatINRShort(v)} />
          <Tooltip
            cursor={{ fill: "var(--brand-soft)", radius: 8 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof rows)[number];
              return (
                <TooltipCard
                  title={formatMonth(p.month)}
                  rows={[
                    { label: "Income", value: p.incomePaise, color: IN },
                    { label: "Expense", value: p.expensePaise, color: OUT },
                    { label: "Net", value: p.incomePaise - p.expensePaise, color: "var(--brand)" },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="incomePaise" name="Income" fill={IN} radius={[6, 6, 0, 0]} maxBarSize={22} />
          <Bar dataKey="expensePaise" name="Expense" fill={OUT} radius={[6, 6, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Donut of spend by category with the total in the middle. */
export function CategoryDonut({ data, totalPaise }: { data: { name: string; totalPaise: number; color: string }[]; totalPaise: number }) {
  return (
    <div className="relative h-52 w-52 shrink-0" role="img" aria-label="Spend by category">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="totalPaise" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={2} cornerRadius={6} stroke="var(--bg-solid)" strokeWidth={2} isAnimationActive>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof data)[number];
              return <TooltipCard title={p.name} rows={[{ label: `${Math.round((p.totalPaise / Math.max(1, totalPaise)) * 100)}% of spend`, value: p.totalPaise, color: p.color }]} />;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Spent</div>
        <div className="text-xl font-extrabold tabular-nums text-fg">{formatINRShort(totalPaise)}</div>
      </div>
    </div>
  );
}

/** Account balance over time: smooth gradient area. */
export function BalanceChart({ data, negativeIsDebt }: { data: { date: string; balancePaise: number }[]; negativeIsDebt?: boolean }) {
  const id = useId().replace(/:/g, "");
  const values = data.map((d) => (negativeIsDebt ? -d.balancePaise : d.balancePaise));
  const rows = data.map((d, i) => ({ date: d.date, value: values[i] }));
  const color = negativeIsDebt ? OUT : "var(--brand)";
  return (
    <div className="h-56 w-full" role="img" aria-label="Balance over time">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={`bal-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={axisTick} tickFormatter={(d: string) => formatDay(d, { short: true })} minTickGap={32} />
          <YAxis tickLine={false} axisLine={false} tick={axisTick} width={52} tickFormatter={(v: number) => formatINRShort(v)} />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof rows)[number];
              return <TooltipCard title={formatDay(p.date)} rows={[{ label: negativeIsDebt ? "Owed" : "Balance", value: p.value, color }]} />;
            }}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#bal-${id})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--bg-solid)" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
