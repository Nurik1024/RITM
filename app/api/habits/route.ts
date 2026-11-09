import { habits, marks } from "../../../db/schema";
import { dateKey, totalXp } from "../../../lib/habits";
import { ApiError, and, api, authenticated, eq, getDb, getProfile, initializeProfile, json, mutationBody } from "../_shared";
export const dynamic = "force-dynamic";
export const GET = api(async () => {
  const user = await authenticated(); const db = getDb();
  const [ownedHabits, ownedMarks, profile] = await Promise.all([
    db.select().from(habits).where(eq(habits.userId, user.userId)),
    db.select({ habitId: marks.habitId, date: marks.date, status: marks.status }).from(marks).where(eq(marks.userId, user.userId)),
    getProfile(user.userId),
  ]);
  return json({ habits: ownedHabits.map(({ userId: _userId, ...habit }) => habit), marks: ownedMarks,
    profile: { timezone: profile?.timezone ?? "UTC", configured: Boolean(profile) }, user: { name: user.displayName },
    serverToday: dateKey(new Date(), profile?.timezone ?? "UTC"), totalXp: totalXp(ownedMarks) });
});
export const POST = api(async (request) => {
  const user = await authenticated(); const body = await mutationBody(request);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 80) throw new ApiError(400, "Название должно содержать от 1 до 80 символов.");
  if (typeof body.emoji !== "string" || !body.emoji.trim() || body.emoji.length > 16) throw new ApiError(400, "Выберите значок привычки.");
  if (typeof body.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(body.color)) throw new ApiError(400, "Выберите корректный цвет.");
  if (!Array.isArray(body.days) || !body.days.length || body.days.length > 7 || body.days.some((d) => !Number.isInteger(d) || d < 1 || d > 7) || new Set(body.days).size !== body.days.length) throw new ApiError(400, "Выберите дни недели.");
  const db = getDb();
  const active = await db.select({ id: habits.id }).from(habits).where(and(eq(habits.userId, user.userId), eq(habits.archived, false)));
  if (active.length >= 50) throw new ApiError(400, "Можно вести до 50 активных привычек.");
  const profile = await initializeProfile(user.userId, body.timezone);
  const habit = { id: crypto.randomUUID(), userId: user.userId, title, emoji: body.emoji.trim(), color: body.color, days: [...body.days].sort((a, b) => a - b) as number[], createdDate: dateKey(new Date(), profile.timezone), archived: false, archivedDate: null };
  await db.insert(habits).values(habit);
  const { userId: _userId, ...result } = habit;
  return json({ habit: result }, 201);
});
export const PATCH = api(async (request) => {
  const user = await authenticated(); const body = await mutationBody(request);
  if (typeof body.id !== "string" || body.id.length > 100 || body.archived !== true) throw new ApiError(400, "Некорректная привычка.");
  const db = getDb();
  const owned = (await db.select().from(habits).where(and(eq(habits.id, body.id), eq(habits.userId, user.userId))).limit(1))[0];
  if (!owned) throw new ApiError(404, "Привычка не найдена.");
  if (!owned.archived) {
    const profile = await getProfile(user.userId);
    await db.update(habits).set({ archived: true, archivedDate: dateKey(new Date(), profile?.timezone ?? "UTC") }).where(and(eq(habits.id, body.id), eq(habits.userId, user.userId), eq(habits.archived, false)));
  }
  return json({ ok: true });
});
