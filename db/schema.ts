import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(), timezone: text("timezone").notNull(),
});
export const habits = sqliteTable("habits", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(),
  title: text("title").notNull(), emoji: text("emoji").notNull(), color: text("color").notNull(),
  days: text("days", { mode: "json" }).$type<number[]>().notNull(),
  createdDate: text("created_date").notNull(),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  archivedDate: text("archived_date"),
}, (t) => [index("habits_user_idx").on(t.userId)]);
export const marks = sqliteTable("marks", {
  habitId: text("habit_id").notNull().references(() => habits.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(), date: text("date").notNull(),
  status: text("status", { enum: ["done", "missed"] }).notNull(),
}, (t) => [primaryKey({ columns: [t.habitId, t.date] }), index("marks_user_idx").on(t.userId)]);
