/**
 * ETA scheduling (pure — no database, safe anywhere).
 *
 * Lays open tasks end to end into working days, each with `dailyHours` of capacity, in the order
 * you would actually work them: priority (P1 first), then due date (soonest first, undated last),
 * then creation time. A task's projected finish is the working day its last minute lands on.
 * Projects finish when their last scheduled task does, and are compared with their deadline.
 */
import { addDays, diffDays, weekday } from "@/lib/dates";

export type EtaTask = {
  id: string;
  projectId?: string | null;
  /** 1 (highest) … 4 (lowest) */
  priority: number;
  dueDate?: string | null;
  createdAt: Date | string;
  /** max(estimate − actual, 0); null when the task has no estimate (it is skipped) */
  remainingMinutes: number | null;
};

export type EtaProject = { id: string; deadline?: string | null };

export type EtaInput = {
  tasks: EtaTask[];
  projects?: EtaProject[];
  /** Hours you can plan per working day */
  dailyHours: number;
  /** 0 = Sunday … 6 = Saturday */
  workdays: number[];
  /** IST calendar day to start scheduling from */
  today: string;
  /** Multiply remaining work by your typical overrun (e.g. 1.3). Defaults to 1. */
  overrunFactor?: number;
  /** Minutes of today's capacity already used up (e.g. time already logged today). */
  usedTodayMinutes?: number;
};

export type TaskEta = {
  /** First working day the task gets time */
  startDate: string;
  /** Working day the task is projected to be finished */
  finishDate: string;
  /** Minutes scheduled for it (remaining × overrun factor, rounded up) */
  scheduledMinutes: number;
  /** Projected to finish after its own due date */
  late: boolean;
};

export type ProjectHealth = "on_track" | "at_risk" | "late" | "no_data";

export type ProjectEta = {
  /** Last projected finish among the project's estimated open tasks, null if none */
  finishDate: string | null;
  deadline: string | null;
  /** True when the projected finish is after the deadline (or the deadline has passed with work left) */
  late: boolean;
  /** Open tasks in this project without an estimate (not scheduled) */
  unestimated: number;
  /** Open tasks in this project that were scheduled */
  scheduled: number;
  /** Total scheduled minutes left on the project */
  remainingMinutes: number;
  health: ProjectHealth;
};

export type EtaResult = {
  tasks: Record<string, TaskEta>;
  projects: Record<string, ProjectEta>;
  /** Ids of tasks that could not be scheduled (no estimate, or no capacity configured) */
  skipped: string[];
  /** Day the whole queue is projected to be cleared, null if nothing scheduled */
  queueFinishDate: string | null;
};

/** Safety valve so a bad input can never spin forever (≈ 27 years of working days). */
const MAX_DAYS = 10_000;

function isWorkday(day: string, workdays: Set<number>) {
  return workdays.has(weekday(day));
}

/** The first working day on or after `day`. */
export function nextWorkday(day: string, workdays: number[]): string {
  const set = new Set(workdays);
  if (set.size === 0) return day;
  let d = day;
  for (let i = 0; i < 14 && !isWorkday(d, set); i++) d = addDays(d, 1);
  return d;
}

function time(v: Date | string): number {
  return typeof v === "string" ? Date.parse(v) : v.getTime();
}

/** Work order: priority asc, then due date asc (undated last), then created asc, then id for stability. */
export function compareForSchedule(a: EtaTask, b: EtaTask): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const ad = a.dueDate ?? null;
  const bd = b.dueDate ?? null;
  if (ad !== bd) {
    if (ad == null) return 1;
    if (bd == null) return -1;
    return ad < bd ? -1 : 1;
  }
  const t = time(a.createdAt) - time(b.createdAt);
  if (t !== 0) return t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function computeEta(input: EtaInput): EtaResult {
  const { today } = input;
  const factor = input.overrunFactor && input.overrunFactor > 0 ? input.overrunFactor : 1;
  const capacity = Math.round(Math.max(0, input.dailyHours) * 60);
  const workdaySet = new Set(input.workdays.filter((d) => d >= 0 && d <= 6));

  const tasks: Record<string, TaskEta> = {};
  const skipped: string[] = [];
  const schedulable: EtaTask[] = [];
  for (const t of input.tasks) {
    if (t.remainingMinutes == null || !Number.isFinite(t.remainingMinutes)) skipped.push(t.id);
    else schedulable.push(t);
  }

  let queueFinishDate: string | null = null;

  if (capacity > 0 && workdaySet.size > 0) {
    schedulable.sort(compareForSchedule);
    let cursor = nextWorkday(today, [...workdaySet]);
    let left = capacity - (cursor === today ? Math.max(0, input.usedTodayMinutes ?? 0) : 0);
    let guard = 0;
    const advance = () => {
      cursor = addDays(cursor, 1);
      while (!isWorkday(cursor, workdaySet)) cursor = addDays(cursor, 1);
      left = capacity;
      if (++guard > MAX_DAYS) throw new Error("ETA scheduling exceeded the safety limit");
    };
    if (left <= 0) advance();

    for (const t of schedulable) {
      const need = Math.ceil(Math.max(0, t.remainingMinutes!) * factor);
      if (left <= 0) advance();
      const startDate = cursor;
      let rest = need;
      while (rest > 0) {
        if (left <= 0) advance();
        const take = Math.min(rest, left);
        rest -= take;
        left -= take;
      }
      tasks[t.id] = {
        startDate,
        finishDate: cursor,
        scheduledMinutes: need,
        late: t.dueDate != null && cursor > t.dueDate,
      };
      queueFinishDate = cursor;
    }
  } else {
    skipped.push(...schedulable.map((t) => t.id));
  }

  // Projects
  const projects: Record<string, ProjectEta> = {};
  const ensure = (id: string, deadline: string | null): ProjectEta =>
    (projects[id] ??= { finishDate: null, deadline, late: false, unestimated: 0, scheduled: 0, remainingMinutes: 0, health: "no_data" });
  const deadlines = new Map((input.projects ?? []).map((p) => [p.id, p.deadline ?? null]));
  for (const p of input.projects ?? []) ensure(p.id, p.deadline ?? null);
  for (const t of input.tasks) {
    if (!t.projectId) continue;
    const p = ensure(t.projectId, deadlines.get(t.projectId) ?? null);
    const eta = tasks[t.id];
    if (!eta) {
      p.unestimated++;
      continue;
    }
    p.scheduled++;
    p.remainingMinutes += eta.scheduledMinutes;
    if (!p.finishDate || eta.finishDate > p.finishDate) p.finishDate = eta.finishDate;
  }
  for (const p of Object.values(projects)) {
    p.health = projectHealth(p, today, [...workdaySet]);
    p.late = p.health === "late";
  }

  return { tasks, projects, skipped, queueFinishDate };
}

/**
 * On track / at risk / late, from a projected finish and a deadline.
 * - late: projected finish after the deadline, or deadline already passed with work left
 * - at risk: finishes on the deadline itself or with at most one working day to spare,
 *   or some open work has no estimate yet (so the projection is optimistic)
 * - no data: no deadline, or nothing open to schedule
 */
export function projectHealth(
  p: Pick<ProjectEta, "finishDate" | "deadline" | "unestimated" | "scheduled">,
  today: string,
  workdays: number[],
): ProjectHealth {
  const openWork = p.scheduled + p.unestimated > 0;
  if (!p.deadline) return "no_data";
  if (!openWork) return "on_track";
  if (p.deadline < today) return "late";
  if (p.finishDate && p.finishDate > p.deadline) return "late";
  if (p.unestimated > 0) return "at_risk";
  if (!p.finishDate) return "no_data";
  // Working days of buffer between finish and deadline
  let buffer = 0;
  const set = new Set(workdays);
  for (let d = addDays(p.finishDate, 1); d <= p.deadline && buffer < 2; d = addDays(d, 1)) if (set.has(weekday(d))) buffer++;
  return buffer <= 1 && diffDays(p.finishDate, p.deadline) >= 0 ? "at_risk" : "on_track";
}
