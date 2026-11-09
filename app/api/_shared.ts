import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../chatgpt-auth";
import { getDb } from "../../db";
import { profiles } from "../../db/schema";
import { validTimezone } from "../../lib/habits";
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization", "X-Content-Type-Options": "nosniff" } });
}
export function api(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try { return await handler(request); } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status);
      console.error("Habit API request failed", error instanceof Error ? error.name : "UnknownError");
      return json({ error: "Не удалось сохранить данные. Попробуйте ещё раз." }, 500);
    }
  };
}
export async function authenticated() {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError(401, "Войдите в аккаунт, чтобы продолжить.");
  return user;
}
export async function mutationBody(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new ApiError(403, "Недопустимый источник запроса.");
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new ApiError(415, "Ожидается JSON.");
  if (Number(request.headers.get("content-length")) > 8192) throw new ApiError(413, "Запрос слишком большой.");
  let value: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError(400, "Пустой запрос.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        length += result.value.byteLength;
        if (length > 8192) { await reader.cancel(); throw new ApiError(413, "Запрос слишком большой."); }
        chunks.push(result.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, "Некорректный JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "Некорректные данные.");
  return value as Record<string, unknown>;
}
export async function getProfile(userId: string) {
  return (await getDb().select().from(profiles).where(eq(profiles.userId, userId)).limit(1))[0];
}
export async function initializeProfile(userId: string, timezone: unknown) {
  const existing = await getProfile(userId);
  if (existing) return existing;
  if (!validTimezone(timezone)) throw new ApiError(400, "Выберите корректный часовой пояс.");
  await getDb().insert(profiles).values({ userId, timezone }).onConflictDoNothing();
  return (await getProfile(userId))!;
}
export { and, eq, getDb };
