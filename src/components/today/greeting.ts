/** Greeting and encouraging copy for the Today hero (pure). */

export function greetingFor(hour: number): { text: string; emoji: string } {
  if (hour < 5) return { text: "Burning the midnight oil", emoji: "🌙" };
  if (hour < 12) return { text: "Good morning", emoji: "☀️" };
  if (hour < 17) return { text: "Good afternoon", emoji: "🌤️" };
  if (hour < 21) return { text: "Good evening", emoji: "🌆" };
  return { text: "Good night", emoji: "🌙" };
}

/** A short positive line that adapts to how the day looks. */
export function plateLine(o: { needs: number; overdue: number; doneToday: number; openToday: number }): string {
  if (o.needs === 0 && o.doneToday > 0) return `${o.doneToday} done and nothing waiting. Enjoy the calm.`;
  if (o.needs === 0) return "All clear. Enjoy the calm.";
  if (o.openToday === 0 && o.doneToday > 0) return `Today's tasks are done — just ${o.needs} small thing${o.needs === 1 ? "" : "s"} left to glance at.`;
  if (o.needs === 1) return "Just one thing on your plate — you've got this.";
  if (o.overdue > 0 && o.overdue === o.needs) return `${o.needs} things to catch up on — one at a time, you've got this.`;
  if (o.overdue > 0) return `${o.needs} things on your plate — start with the ${o.overdue === 1 ? "overdue one" : `${o.overdue} overdue`} and the rest will flow.`;
  if (o.doneToday > 0) return `${o.doneToday} down, ${o.needs} to go — nice momentum.`;
  return `${o.needs} things on your plate — you've got this.`;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Wednesday, 14 October" */
export function longDate(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Tomorrow" / "Friday" / "Mon 20 Oct" for the coming-up timeline. */
export function dayHeading(day: string, today: string): { title: string; sub: string } {
  const d = new Date(`${day}T00:00:00Z`);
  const diff = Math.round((d.getTime() - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const short = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
  if (diff === 1) return { title: "Tomorrow", sub: `${DAYS[d.getUTCDay()].slice(0, 3)}, ${short}` };
  return { title: DAYS[d.getUTCDay()], sub: short };
}
