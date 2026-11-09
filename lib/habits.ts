export type Habit = { id: string; title: string; emoji: string; color: string; days: number[]; createdDate: string; archived: boolean; archivedDate?: string | null };
export type Mark = { habitId: string; date: string; status: "done" | "missed" };
export const XP_PER_DONE = 25;
export function validTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}
export function dateKey(date = new Date(), timezone = "UTC"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function validDateKey(key: unknown): key is string {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const date = new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === key;
}
export function shiftDate(key: string, amount: number): string {
  if (!validDateKey(key)) throw new Error("Invalid calendar date");
  const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function weekday(key: string): number {
  if (!validDateKey(key)) throw new Error("Invalid calendar date");
  return new Date(`${key}T12:00:00Z`).getUTCDay() || 7;
}
export function monthDays(month: string): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid calendar month");
  const count = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}
export function scheduled(habit: Habit, key: string): boolean {
  return validDateKey(key) && key >= habit.createdDate && (!habit.archivedDate || key <= habit.archivedDate) && habit.days.includes(weekday(key));
}
export function editableDate(habit: Habit, key: string, today: string): boolean {
  return !habit.archived && (key === today || key === shiftDate(today, -1)) && scheduled(habit, key);
}
export function totalXp(marks: Mark[]): number {
  const unique = new Map(marks.map((m) => [`${m.habitId}:${m.date}`, m.status]));
  return [...unique.values()].filter((status) => status === "done").length * XP_PER_DONE;
}
export function monthStats(habits: Habit[], marks: Mark[], month: string, today: string) {
  const lookup = new Map(marks.map((m) => [`${m.habitId}:${m.date}`, m.status]));
  let planned = 0, done = 0, missed = 0, remaining = 0;
  for (const habit of habits) for (const date of monthDays(month)) {
    if (!scheduled(habit, date)) continue;
    planned++;
    const status = lookup.get(`${habit.id}:${date}`);
    if (status === "done") done++;
    else if (status === "missed" || date < today) missed++;
    else remaining++;
  }
  return { planned, done, missed, remaining, percent: planned ? Math.round(done / planned * 100) : 0 };
}

// A series follows one habit's scheduled occurrences; rest days never break it.
export function bestStreak(habits: Habit[], marks: Mark[], month: string, today: string): number {
  const lookup = new Map(marks.map((mark) => [`${mark.habitId}:${mark.date}`, mark.status]));
  const dates = monthDays(month).filter((date) => date <= today);
  let best = 0;
  for (const habit of habits) {
    let current = 0;
    for (const date of dates) {
      if (!scheduled(habit, date)) continue;
      if (lookup.get(`${habit.id}:${date}`) === "done") {
        current++;
        best = Math.max(best, current);
      } else current = 0;
    }
  }
  return best;
}
