import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node's native TypeScript runner requires the source extension.
import { bestStreak, dateKey, editableDate, monthDays, monthStats, scheduled, shiftDate, totalXp, validDateKey, validTimezone, weekday, type Habit } from "../lib/habits.ts";
const habit: Habit = { id: "a", title: "Run", emoji: "🏃", color: "#aaff00", days: [1, 3, 5], createdDate: "2026-11-10", archived: false };
test("calendar crosses month, year and leap-day boundaries", () => {
  assert.equal(shiftDate("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDate("2024-03-01", -1), "2024-02-29");
  assert.equal(monthDays("2024-02").length, 29);
  assert.equal(monthDays("2026-02").length, 28);
  assert.equal(weekday("2026-11-09"), 1);
  assert.equal(weekday("2026-11-15"), 7);
  assert.equal(validDateKey("2026-02-30"), false);
  assert.throws(() => monthDays("2026-13"));
});
test("today uses persisted timezone; DST does not affect calendar shifts", () => {
  assert.equal(dateKey(new Date("2026-11-09T20:00:00Z"), "Asia/Qyzylorda"), "2026-11-10");
  assert.equal(dateKey(new Date("2026-11-09T20:00:00Z"), "America/Los_Angeles"), "2026-11-09");
  assert.equal(shiftDate("2026-03-09", -1), "2026-03-08");
  assert.equal(validTimezone("Not/AZone"), false);
});
test("schedule excludes precreation, rest days and dates after archive", () => {
  assert.equal(scheduled(habit, "2026-11-09"), false);
  assert.equal(scheduled(habit, "2026-11-10"), false);
  assert.equal(scheduled(habit, "2026-11-11"), true);
  assert.equal(scheduled({ ...habit, archived: true, archivedDate: "2026-11-13" }, "2026-11-16"), false);
});
test("edits limited to today/yesterday and active scheduled dates", () => {
  assert.equal(editableDate(habit, "2026-11-11", "2026-11-11"), true);
  assert.equal(editableDate(habit, "2026-11-11", "2026-11-12"), true);
  assert.equal(editableDate(habit, "2026-11-11", "2026-11-13"), false);
  assert.equal(editableDate(habit, "2026-11-13", "2026-11-12"), false);
  assert.equal(editableDate(habit, "2026-11-12", "2026-11-12"), false);
  assert.equal(editableDate({ ...habit, archived: true }, "2026-11-11", "2026-11-11"), false);
});
test("percentage uses full planned month, ignoring rest and precreation", () => {
  const marks = [{ habitId: "a", date: "2026-11-11", status: "done" as const }, { habitId: "a", date: "2026-11-13", status: "missed" as const }];
  const result = monthStats([habit], marks, "2026-11", "2026-11-17");
  assert.equal(result.planned, 9);
  assert.equal(result.done, 1);
  assert.equal(result.missed, 2);
  assert.equal(result.remaining, 6);
  assert.equal(result.percent, 11);
  assert.equal(monthStats([], [], "2026-11", "2026-11-17").percent, 0);
});
test("duplicate completions cannot farm XP; undo removes XP", () => {
  const mark = { habitId: "a", date: "2026-11-11", status: "done" as const };
  assert.equal(totalXp([mark, mark]), 25);
  assert.equal(totalXp([mark, { ...mark, status: "missed" }]), 0);
  assert.equal(totalXp([mark, { ...mark, habitId: "b" }]), 50);
});
test("best series ignores rest days, breaks at missed and unmarked scheduled occurrences", () => {
  const mark = (date: string, status: "done" | "missed" = "done") => ({ habitId: "a", date, status });
  const streakHabit = { ...habit, createdDate: "2026-11-01" };
  const marks = [mark("2026-11-02"), mark("2026-11-04"), mark("2026-11-06"), mark("2026-11-09", "missed"), mark("2026-11-11"), mark("2026-11-16"), mark("2026-11-18")];
  assert.equal(bestStreak([streakHabit], marks, "2026-11", "2026-11-18"), 3);
  assert.equal(bestStreak([streakHabit], marks, "2026-11", "2026-11-03"), 1);
});
test("best series never merges habits or counts future dates or archived future schedule", () => {
  const a = { ...habit, createdDate: "2026-11-01" };
  const b = { ...a, id: "b" };
  const marks = [
    { habitId: "a", date: "2026-11-02", status: "done" as const },
    { habitId: "b", date: "2026-11-04", status: "done" as const },
    { habitId: "a", date: "2026-11-06", status: "done" as const },
    { habitId: "a", date: "2026-11-09", status: "done" as const },
  ];
  assert.equal(bestStreak([a, b], marks, "2026-11", "2026-11-06"), 1);
  assert.equal(bestStreak([{ ...a, archived: true, archivedDate: "2026-11-06" }], marks, "2026-11", "2026-11-30"), 1);
  assert.equal(bestStreak([], [], "2026-11", "2026-11-30"), 0);
});
