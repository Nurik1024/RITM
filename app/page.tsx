import { getChatGPTUser } from './chatgpt-auth';
import RitmApp from './ritm-app';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await getChatGPTUser();
  return <RitmApp signedIn={!!user} initialName={user?.displayName || ''} />;
}
