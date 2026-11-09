// Local-only isolation test: seeds a second user's rows directly in local D1.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const base = new URL(process.argv[2] ?? 'http://127.0.0.1:5173');
assert(['127.0.0.1','localhost'].includes(base.hostname), 'Local preview only');
const id = randomUUID();
const owner = `security_other_${randomUUID()}`;
function sql(command) {
  execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',command], {stdio:'pipe'});
}
const signIn = await fetch(new URL('/signin-with-chatgpt?return_to=/',base),{redirect:'manual'});
const cookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0];
assert(cookie,'Local sign-in cookie required');
const read = async () => (await fetch(new URL('/api/habits',base),{headers:{cookie}})).json();
const before = await read();
const today = before.serverToday;
assert.match(today,/^\d{4}-\d{2}-\d{2}$/);
let seeded = false;
try {
  sql(`INSERT INTO habits(id,user_id,title,emoji,color,days,created_date,archived) VALUES('${id}','${owner}','Foreign fixture','x','#c9f76b','[1,2,3,4,5,6,7]','${today}',0)`);
  seeded = true;
  sql(`INSERT INTO marks(habit_id,user_id,date,status) VALUES('${id}','${owner}','${today}','done')`);
  const data = await read();
  assert(!data.habits.some(h=>h.id===id), 'Another user habit leaked');
  assert(!data.marks.some(m=>m.habitId===id), 'Another user mark leaked');
  assert.equal(data.totalXp,before.totalXp,'Another user XP leaked');
  console.log('PASS Second user habits, marks and XP isolated on read');
  for (const [path,method,body] of [
    ['/api/marks','POST',{habitId:id,date:today,status:'missed'}],
    ['/api/marks','POST',{habitId:id,date:today,status:null}],
    ['/api/habits','PATCH',{id,archived:true}],
  ]) {
    const r = await fetch(new URL(path,base),{method,headers:{cookie,origin:base.origin,'content-type':'application/json'},body:JSON.stringify(body)});
    assert.equal(r.status,404,`Foreign row mutation not denied: ${path} ${method}`);
  }
  console.log('PASS Second user mark update/delete and habit archive denied');
} finally {
  if (seeded) {
    sql(`DELETE FROM marks WHERE habit_id='${id}' AND user_id='${owner}'`);
    sql(`DELETE FROM habits WHERE id='${id}' AND user_id='${owner}'`);
  }
}
