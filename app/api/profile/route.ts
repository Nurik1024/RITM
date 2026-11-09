import { api, authenticated, initializeProfile, json, mutationBody } from "../_shared";
export const dynamic = "force-dynamic";
export const POST = api(async (request) => {
  const user = await authenticated(); const body = await mutationBody(request);
  const profile = await initializeProfile(user.userId, body.timezone);
  return json({ profile: { timezone: profile.timezone, configured: true } });
});
