/**
 * Due-date buckets for the task list (pure).
 */
import { addDays, weekday } from "@/lib/dates";

export const BUCKETS = ["overdue", "today", "tomorrow", "week", "later", "none"] as const;
export type Bucket = (typeof BUCKETS)[number];

export const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  later: "Later",
  none: "No date",
};

/** Last day (Sunday) of the week containing `today`; weeks run Monday → Sunday. */
export function endOfWeek(today: string): string {
  const wd = weekday(today); // 0 = Sunday
  return addDays(today, wd === 0 ? 0 : 7 - wd);
}

export function bucketFor(dueDate: string | null | undefined, today: string): Bucket {
  if (!dueDate) return "none";
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  if (dueDate === addDays(today, 1)) return "tomorrow";
  if (dueDate <= endOfWeek(today)) return "week";
  return "later";
}

/** Groups items into ordered buckets, dropping empty ones. Items keep their incoming order inside a bucket. */
export function groupByBucket<T extends { dueDate: string | null }>(items: T[], today: string): { bucket: Bucket; label: string; items: T[] }[] {
  const map = new Map<Bucket, T[]>();
  for (const it of items) {
    const b = bucketFor(it.dueDate, today);
    const arr = map.get(b) ?? [];
    arr.push(it);
    map.set(b, arr);
  }
  return BUCKETS.filter((b) => map.has(b)).map((b) => ({ bucket: b, label: BUCKET_LABEL[b], items: map.get(b)! }));
}
