import { habits, marks } from "../../../db/schema";
import { dateKey, editableDate, validDateKey } from "../../../lib/habits";
import { ApiError, and, api, authenticated, eq, getDb, getProfile, json, mutationBody } from "../_shared";
export const dynamic = "force-dynamic";
export const POST = api(async (request) => {
  const user = await authenticated(); const body = await mutationBody(request);
  if (typeof body.habitId !== "string" || body.habitId.length > 100 || !validDateKey(body.date) || !["done", "missed", null].includes(body.status as string | null)) throw new ApiError(400, "Некорректная отметка.");
  const db = getDb();
  const habit = (await db.select().from(habits).where(and(eq(habits.id, body.habitId), eq(habits.userId, user.userId))).limit(1))[0];
  if (!habit) throw new ApiError(404, "Привычка не найдена.");
  const profile = await getProfile(user.userId);
  if (!profile) throw new ApiError(400, "Сначала настройте часовой пояс.");
  if (!editableDate(habit, body.date, dateKey(new Date(), profile.timezone))) throw new ApiError(400, "Отметки доступны только за сегодня и вчера, в запланированные дни активной привычки.");
  if (body.status === null) await db.delete(marks).where(and(eq(marks.habitId, habit.id), eq(marks.date, body.date), eq(marks.userId, user.userId)));
  else await db.insert(marks).values({ habitId: habit.id, userId: user.userId, date: body.date, status: body.status as "done" | "missed" }).onConflictDoUpdate({ target: [marks.habitId, marks.date], set: { status: body.status as "done" | "missed" }, where: eq(marks.userId, user.userId) });
  return json({ ok: true });
});
