import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { io, type Socket } from 'socket.io-client';
import { createApp } from '../backend/src/app.ts';
import { Store, AppError } from '../backend/src/store.ts';
import type { Settings } from '../backend/src/settings.ts';
import type { Snapshot, Vote } from '../shared/model.ts';
const settings:Settings={demo:false,dbPath:':memory:',scenesPath:'shared/scenes.json',publicUrl:'http://localhost:5173',adminKey:'test-admin-key-not-for-use-in-production',phoneSecret:'test-phone-hash-secret-not-production',origins:['onlyoffice://plugin','http://localhost:5173'],port:0,host:'127.0.0.1',trustProxy:0,retentionDays:30};
function fixture() {
  const store=new Store(settings);store.upsertParticipant('0612345678','student-code');store.upsertParticipant('0712345678','another-code');
  const sid=store.start();const token=store.join(sid,'+212612345678','student-code').token;const id=store.identity(token)!;
  assert.equal(id.role,'participant');
  const command=(action:Parameters<Store['command']>[1])=>store.command(sid,action,store.session(sid)!.version);
  const vote:Vote={sceneId:'silence',epoch:0,optionIds:['oui'],words:['Silence','Regard'],requestId:randomUUID()};
  return {store,sid,token,id:id as Extract<typeof id,{role:'participant'}>,command,vote};
}
test('whitelist + individual code authenticate; guessing phone alone fails',()=>{
  const f=fixture();try {
    assert.equal(f.store.identity(f.token)?.role,'participant');
    assert.throws(()=>f.store.join(f.sid,'0612345678','wrong'),(e:unknown)=>e instanceof AppError && e.status===401);
    assert.throws(()=>f.store.join(f.sid,'0611111111','student-code'));
    const row=f.store.db.prepare('SELECT * FROM authorized_participants LIMIT 1').get()!;
    assert.ok(!JSON.stringify(row).includes('0612345678'));assert.ok(!JSON.stringify(row).includes('student-code'));
  }finally{f.store.db.close();}
});
test('second login rotates token without losing participant votes',()=>{
  const f=fixture();try{
    f.command('activate');f.command('open');f.store.vote(f.id,f.vote);
    const next=f.store.join(f.sid,'00212612345678','student-code').token;
    assert.equal(f.store.identity(f.token),undefined);assert.ok(f.store.snapshot(f.store.identity(next)).submitted);
  }finally{f.store.db.close();}
});
test('atomic vote validation prevents duplicate responses; acknowledgements are idempotent',()=>{
  const f=fixture();try {
    assert.throws(()=>f.store.vote(f.id,f.vote));f.command('activate');f.command('open');
    assert.equal(f.store.vote(f.id,f.vote).accepted,true);
    assert.equal(f.store.vote(f.id,f.vote).alreadyAccepted,true);
    assert.throws(()=>f.store.vote(f.id,{...f.vote,requestId:randomUUID()}),(e:unknown)=>e instanceof AppError && e.code==='ALREADY_VOTED');
    f.command('close');assert.equal(f.store.vote(f.id,f.vote).alreadyAccepted,true);
    assert.equal(f.store.snapshot({role:'admin'}).results?.total,1);
  }finally{f.store.db.close();}
});
test('malicious options, too many words, duplicates and custom words are rejected',()=>{
  const f=fixture();try {
    f.command('activate');f.command('open');
    for(const v of [{optionIds:['bogus']},{optionIds:['oui','non']},{words:['Silence','Silence']},{words:['free text']},{words:['Silence','Regard','Gestes','Posture']}])assert.throws(()=>f.store.vote(f.id,{...f.vote,...v}));
    assert.equal(f.store.snapshot({role:'admin'}).responseCount,0);
  }finally{f.store.db.close();}
});
test('reset increments epoch so queued votes cannot enter a new round',()=>{
  const f=fixture();try {
    f.command('activate');f.command('open');f.store.vote(f.id,f.vote);f.command('reset');f.command('open');
    assert.throws(()=>f.store.vote(f.id,f.vote),(e:unknown)=>e instanceof AppError && e.code==='STALE_VOTE');
    assert.equal(f.store.snapshot(f.id).submitted,false);
    f.store.vote(f.id,{...f.vote,epoch:1,requestId:randomUUID()});assert.equal(f.store.snapshot(f.id).submitted,true);
  }finally{f.store.db.close();}
});
test('closed voting rejects new responses; stale presenter commands fail',()=>{
  const f=fixture();try {
    f.command('activate');f.command('open');f.command('close');assert.throws(()=>f.store.vote(f.id,f.vote));
    assert.throws(()=>f.store.command(f.sid,'results',1));
    f.command('results');f.command('next');assert.equal(f.store.snapshot(f.id).scene?.id,'relation');
    assert.throws(()=>f.store.vote(f.id,f.vote));
    assert.throws(()=>f.command('next'));assert.throws(()=>f.store.start());
  }finally{f.store.db.close();}
});
test('anonymous audience projection exposes aggregates only in RESULTS',()=>{
  const f=fixture();try {
    f.command('activate');f.command('open');f.store.vote(f.id,f.vote);
    assert.equal(f.store.snapshot().results,undefined);assert.equal(f.store.snapshot(f.id).results,undefined);
    f.command('close');f.command('results');const view=f.store.snapshot();
    assert.equal(view.results?.total,1);
    for(const secret of ['0612345678',f.id.participantId,f.token,'token_hash','phone_hash'])assert.ok(!JSON.stringify(view).includes(secret));
    const csv=f.store.exportCsv(f.sid);assert.ok(csv.includes('66.7')===false);assert.ok(csv.includes('Silence'));assert.ok(!csv.includes(f.id.participantId));
  }finally{f.store.db.close();}
});
test('finished session deletion cascades through responses, tokens, rounds and logs',()=>{
  const f=fixture();try {
    assert.throws(()=>f.store.deleteSession(f.sid));f.command('finish');f.store.deleteSession(f.sid);
    for(const table of ['presentation_sessions','participant_sessions','responses','scene_rounds','event_log'])assert.equal((f.store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {n:number}).n,0);
    assert.equal((f.store.db.prepare('SELECT COUNT(*) AS n FROM authorized_participants').get() as {n:number}).n,2);
  }finally{f.store.db.close();}
});
test('SQLite persists session state and votes across restart',()=>{
  mkdirSync('work',{recursive:true});const path=`work/test-${randomUUID()}.sqlite`;
  const s=new Store({...settings,dbPath:path});s.upsertParticipant('0612345678','student-code');const id=s.start();s.command(id,'activate',1);s.command(id,'open',2);
  const token=s.join(id,'0612345678','student-code').token;
  const identity=s.identity(token)!;assert.equal(identity.role,'participant');
  s.vote(identity as Extract<typeof identity,{role:'participant'}>,{sceneId:'silence',epoch:0,optionIds:['oui'],words:['Silence'],requestId:randomUUID()});s.db.close();
  const again=new Store({...settings,dbPath:path});assert.equal(again.snapshot(again.identity(token)).submitted,true);assert.equal(again.snapshot().state,'VOTING_OPEN');again.db.close();
  rmSync(path);for(const suffix of ['-wal','-shm'])rmSync(path+suffix,{force:true});
});

const server=createApp(settings);let base='',admin='',participant='',sid='';
before(async()=>{
  server.store.upsertParticipant('0612345678','student-code');
  await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));
  const address=server.http.address();assert.ok(address && typeof address!=='string');base=`http://127.0.0.1:${address.port}`;
});
after(async()=>await server.close());
async function api(path:string,token='',body?:unknown,method?:string) {
  return fetch(base+path,{method:method || (body===undefined ? 'GET' : 'POST'),headers:{'Content-Type':'application/json',...(token ? {Authorization:`Bearer ${token}`} : {})},body:body===undefined ? undefined : JSON.stringify(body)});
}
const connect=async(token:string)=>{
  const socket=io(base,{auth:{token}});
  await new Promise<void>((r,j)=>{socket.once('connect',r);socket.once('connect_error',j);});return socket;
};
async function snapshot(socket:Socket,predicate:(s:Snapshot)=>boolean) {
  return new Promise<Snapshot>((r,j)=>{
    const timeout=setTimeout(()=>{socket.off('snapshot',receive);j(new Error('Snapshot timeout'));},5000);
    const receive=(s:Snapshot)=>{if(predicate(s)){clearTimeout(timeout);socket.off('snapshot',receive);r(s);}};socket.on('snapshot',receive);
  });
}
test('HTTP permissions, CORS preflight, realtime state, reconnect and concurrent votes',async()=>{
  assert.equal((await api('/api/admin/start','',{})).status,401);
  assert.equal((await api('/api/admin/login','',{key:'wrong'})).status,401);
  admin=(await (await api('/api/admin/login','',{key:settings.adminKey})).json()).token;
  sid=(await (await api('/api/admin/start',admin,{})).json()).session;
  participant=(await (await api('/api/join','',{sessionId:sid,phone:'0612345678',pin:'student-code'})).json()).token;
  assert.equal((await api('/api/admin/command',participant,{action:'open',expectedVersion:1})).status,403);
  const preflight=await fetch(base+'/api/state',{method:'OPTIONS',headers:{Origin:'onlyoffice://plugin','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization,content-type'}});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'onlyoffice://plugin');
  assert.equal((await fetch(base+'/api/public/state',{headers:{Origin:'https://malicious.example'}})).status,403);
  const socket=await connect(participant);
  const update=snapshot(socket,s=>s.state==='VOTING_OPEN');
  await api('/api/admin/command',admin,{action:'activate',expectedVersion:1});await api('/api/admin/command',admin,{action:'open',expectedVersion:2});
  assert.equal((await update).state,'VOTING_OPEN');
  const vote={sceneId:'silence',epoch:0,optionIds:['oui'],words:['Silence'],requestId:randomUUID()};
  const [a,b]=await Promise.all([api('/api/vote',participant,vote),api('/api/vote',participant,{...vote,requestId:randomUUID()})]);
  assert.deepEqual([a.status,b.status].sort(),[200,409]);
  socket.disconnect();
  const resumed=io(base,{auth:{token:participant}});const resync=snapshot(resumed,s=>s.submitted===true);assert.equal((await resync).submitted,true);resumed.disconnect();
  assert.equal((await api('/api/admin/command',admin,{action:'finish',expectedVersion:3})).status,400);
  assert.equal((await api('/api/admin/command',admin,{action:'finish',expectedVersion:3,confirm:true})).status,200);
  assert.equal((await api('/api/join','',{sessionId:sid,phone:'0612345678',pin:'student-code'})).status,409);
});
