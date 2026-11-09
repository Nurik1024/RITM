// Independent HTTP security/regression checks. Run only against local preview.
// Creates one local audit habit, removes its mark, and archives it afterwards.
import assert from 'node:assert/strict';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:5173');
assert(['127.0.0.1', 'localhost'].includes(base.hostname), 'Audit is local-only');
let cookie = '';
let habitId;
let passed = 0;
const check = (name, fn) => async () => { await fn(); passed++; console.log(`PASS ${name}`); };
async function request(path, { method = 'GET', body, auth = true, origin = base.origin, headers = {} } = {}) {
  return fetch(new URL(path, base), {
    method,
    headers: { ...(auth && cookie ? { cookie } : {}), ...(method !== 'GET' && origin ? { origin } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual',
  });
}
function dateInZone(zone) {
  const p = new Intl.DateTimeFormat('en-CA', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date());
  return ['year','month','day'].map(k => p.find(v => v.type === k).value).join('-');
}
function addDays(key, delta) { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+delta); return d.toISOString().slice(0,10); }
const expectRejected = response => assert([400,403,404,409,413,415,422].includes(response.status), `Expected rejected request, got ${response.status}`);

try {
  await check('Anonymous data access denied', async () => {
    assert.equal((await request('/api/habits', {auth:false})).status, 401);
  })();
  await check('Client-supplied identity headers cannot sign in', async () => {
    assert.equal((await request('/api/habits', {auth:false, headers:{'oai-authenticated-user-id':'attacker','oai-authenticated-user-email':'attacker@example.test'}})).status, 401);
  })();
  const signIn = await request('/signin-with-chatgpt?return_to=/', {auth:false});
  cookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0];
  assert(cookie, 'Local mock sign-in cookie unavailable');
  let initial;
  await check('Authenticated data is private and not cached', async () => {
    const r = await request('/api/habits'); assert.equal(r.status,200);
    assert.match(r.headers.get('cache-control') ?? '', /no-store/i); initial = await r.json();
    assert(Array.isArray(initial.habits)); assert(Array.isArray(initial.marks));
  })();
  const zone = initial.profile?.timezone ?? 'UTC';
  const today = dateInZone(zone);
  const payload = {title:`Audit ${Date.now()}`,emoji:'🧪',color:'#c9f76b',days:[1,2,3,4,5,6,7],timezone:zone};
  await check('Cross-origin mutations denied', async () => {
    assert.equal((await request('/api/habits',{method:'POST',body:payload,origin:'https://evil.example'})).status,403);
  })();
  await check('Missing-origin mutations denied', async () => {
    assert.equal((await request('/api/habits',{method:'POST',body:payload,origin:null})).status,403);
  })();
  await check('Anonymous mutation denied', async () => {
    assert.equal((await request('/api/habits',{method:'POST',body:payload,auth:false})).status,401);
  })();
  await check('Non-JSON mutation rejected', async () => {
    assert.equal((await request('/api/habits',{method:'POST',body:payload,headers:{'content-type':'text/plain'}})).status,415);
  })();
  await check('Streamed UTF-8 request body is byte-limited', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({title:'€'.repeat(4000)}));
    const body = new ReadableStream({start(controller) { controller.enqueue(bytes); controller.close(); }});
    const r = await fetch(new URL('/api/habits',base),{method:'POST',body,duplex:'half',headers:{cookie,origin:base.origin,'content-type':'application/json'}});
    assert.equal(r.status,413);
  })();
  await check('Malformed schedule rejected', async () => {
    expectRejected(await request('/api/habits',{method:'POST',body:{...payload,days:[0,8]}}));
    expectRejected(await request('/api/habits',{method:'POST',body:{...payload,days:[]}}));
    expectRejected(await request('/api/habits',{method:'POST',body:{...payload,title:'x'.repeat(10000)}}));
  })();
  const created = await request('/api/habits',{method:'POST',body:payload});
  assert([200,201].includes(created.status), `Audit habit creation failed: ${created.status} ${await (created.status >= 400 ? created.text() : Promise.resolve(''))}`);
  const list = await (await request('/api/habits')).json();
  habitId = list.habits.find(h => h.title === payload.title)?.id;
  assert(habitId, 'Audit habit not in authenticated list');
  await check('Unknown/non-owned habit mutations denied', async () => {
    expectRejected(await request('/api/marks',{method:'POST',body:{habitId:'non-owned-test-id',date:today,status:'done'}}));
    expectRejected(await request('/api/habits',{method:'PATCH',body:{id:'non-owned-test-id',archived:true}}));
  })();
  await check('Future, old and malformed mark dates rejected', async () => {
    for (const date of [addDays(today,1),addDays(today,-2),'2026-02-30','2026-1-01','not-a-date']) {
      expectRejected(await request('/api/marks',{method:'POST',body:{habitId,date,status:'done'}}));
    }
  })();
  await check('Duplicate completion does not award duplicate XP', async () => {
    const before = await (await request('/api/habits')).json();
    for (let i=0;i<2;i++) {
      const r = await request('/api/marks',{method:'POST',body:{habitId,date:today,status:'done'}}); assert.equal(r.status,200);
    }
    const after = await (await request('/api/habits')).json();
    assert.equal(after.totalXp-before.totalXp,25);
    assert.equal(after.marks.filter(m=>m.habitId===habitId && m.date===today && m.status==='done').length,1);
    const r = await request('/api/marks',{method:'POST',body:{habitId,date:today,status:'missed'}}); assert.equal(r.status,200);
    const undone = await (await request('/api/habits')).json(); assert.equal(undone.totalXp,before.totalXp);
  })();
  await check('Unknown mark status rejected', async () => {
    expectRejected(await request('/api/marks',{method:'POST',body:{habitId,date:today,status:'admin'}}));
  })();
  await check('Profile timezone cannot be changed to bypass day restrictions', async () => {
    const alternate = zone==='Pacific/Kiritimati' ? 'Pacific/Pago_Pago' : 'Pacific/Kiritimati';
    await request('/api/profile',{method:'POST',body:{timezone:alternate}});
    const unchanged = await (await request('/api/habits')).json();
    assert.equal(unchanged.profile.timezone,zone);
  })();
  console.log(`${passed} security/regression checks passed. Run security-isolation.mjs for a second-user local D1 fixture test; hosted provider login is a separate integration check.`);
} finally {
  if (habitId && cookie) {
    await request('/api/marks',{method:'POST',body:{habitId,date:dateInZone((await (await request('/api/habits')).json()).profile?.timezone ?? 'UTC'),status:null}}).catch(()=>{});
    await request('/api/habits',{method:'PATCH',body:{id:habitId,archived:true}}).catch(()=>{});
  }
}
