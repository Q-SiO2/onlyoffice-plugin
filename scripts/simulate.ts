import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { type Snapshot } from '../shared/model.ts';
const args=process.argv.slice(2),arg=(name:string,defaultValue:string)=>args.includes(name) ? args[args.indexOf(name)+1] : defaultValue;
const base=arg('--url','http://localhost:3000'),n=Number(arg('--participants','30'));
if(!Number.isInteger(n) || n<1 || n>100)throw new Error('Demo simulation supports 1–100 participants.');
async function api<T>(path:string,token='',body?:unknown):Promise<T> {
  const r=await fetch(base+path,{method:body===undefined ? 'GET' : 'POST',headers:{...(token ? {Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},body:body===undefined ? undefined : JSON.stringify(body)});
  if(!r.ok)throw new Error(`HTTP ${r.status}: ${await r.text()}`);return r.json() as Promise<T>;
}
const health=await api<{demo:boolean}>('/api/health');
if(!health.demo)throw new Error('Simulation refuses to modify a production server. Use npm run demo.');
const admin=(await api<{token:string}>('/api/admin/login','',{key:'demo-presenter'})).token;
let state=await api<Snapshot>('/api/state',admin);
if(!state.session || state.state==='FINISHED'){await api('/api/admin/start',admin,{});state=await api('/api/state',admin);}
async function cmd(action:string) {state=await api('/api/admin/command',admin,{action,expectedVersion:state.version,confirm:true});}
if(state.state==='VOTING_OPEN')await cmd('close');
await cmd('reset');await cmd('open');
const sockets:Socket[]=[];
try {
  const tokens:string[]=[];
  for(let i=1;i<=n;i++) {
    const r=await api<{token:string}>('/api/join','',{sessionId:state.session,phone:'061'+String(i).padStart(7,'0'),pin:'demo1234'});
    tokens.push(r.token);const socket=io(base,{auth:{token:r.token}});sockets.push(socket);
    await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);setTimeout(()=>reject(new Error('Socket connection timeout')),8000).unref();});
  }
  await Promise.all(tokens.map((token,i)=>api('/api/vote',token,{sceneId:state.scene!.id,epoch:state.epoch,optionIds:[state.scene!.poll.options[i%state.scene!.poll.options.length].id],words:state.scene!.words.options.slice(i%Math.max(1,state.scene!.words.options.length-1),i%Math.max(1,state.scene!.words.options.length-1)+Math.min(2,state.scene!.words.maxSelections)),requestId:randomUUID()})));
  state=await api('/api/state',admin);assert.equal(state.responseCount,n);assert.equal(state.connected,n);
  console.log(`PASS: ${n} connected, ${state.responseCount} persisted votes. ${state.results!.words.length} word frequencies.`);
  await cmd('close');await cmd('results');
  console.log('Results are now visible. Open the presenter dashboard or projector.');
  const hold=Number(arg('--hold','5'));if(hold>0)await new Promise(r=>setTimeout(r,hold*1000));
} finally {sockets.forEach(s=>s.disconnect());}
