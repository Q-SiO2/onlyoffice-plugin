import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const exec = promisify(execFile),
  suffix = randomUUID(),
  db = `work/production-${suffix}.sqlite`,
  input = `work/production-${suffix}.csv`,
  codes = `work/production-${suffix}.private.csv`;
await mkdir('work', { recursive: true });
await writeFile(input, 'phone,name,pin\n0612345678,,test-student-code\n');
const env = {
  ...process.env,
  PORT: '3311',
  HOST: '127.0.0.1',
  DEMO_MODE: 'false',
  DATABASE_PATH: db,
  ADMIN_KEY: 'production-smoke-fake-admin-key-123456',
  PHONE_HASH_SECRET: 'production-smoke-different-fake-secret',
  PUBLIC_URL: 'http://127.0.0.1:3311',
};
await exec(process.execPath, ['dist/scripts/import-class.js', input, codes], { env });
const child = spawn(process.execPath, ['dist/backend/index.js'], {
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', (b) => {
  log += b.toString();
});
child.stderr.on('data', (b) => {
  log += b.toString();
});
const exited = new Promise<void>((r) => child.once('exit', () => r()));
const base = 'http://127.0.0.1:3311';
async function api(path: string, token = '', body?: unknown) {
  const r = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal(r.status, 200);
  return r.json();
}
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Server may still be starting. Retry within the bounded startup window. */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, log);
  assert.equal((await api('/api/health')).demo, false);
  for (const route of ['/', '/presenter', '/display']) {
    const r = await fetch(base + route);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /assets\/index/);
    assert.ok(r.headers.get('content-security-policy'));
  }
  const admin = (await api('/api/admin/login', '', { key: env.ADMIN_KEY })).token;
  const sid = (await api('/api/admin/start', admin, {})).session;
  const token = (
    await api('/api/join', '', {
      sessionId: sid,
      phone: '00212612345678',
      pin: 'test-student-code',
    })
  ).token;
  await api('/api/admin/command', admin, { action: 'activate', expectedVersion: 1 });
  await api('/api/admin/command', admin, { action: 'open', expectedVersion: 2 });
  await api('/api/vote', token, {
    sceneId: 'silence',
    epoch: 0,
    optionIds: ['oui'],
    words: ['Regard'],
    requestId: randomUUID(),
  });
  assert.equal((await api('/api/state', admin)).results.total, 1);
  await api('/api/admin/command', admin, { action: 'close', expectedVersion: 3 });
  await api('/api/admin/command', admin, { action: 'results', expectedVersion: 4 });
  assert.equal((await api(`/api/public/state?session=${sid}`)).results.total, 1);
  console.log(
    'PASS: compiled CLI import, production Node startup, static routes/CSP, whitelist login, vote and public results.',
  );
} finally {
  child.kill();
  await exited;
  for (const path of [db, db + '-wal', db + '-shm', input, codes]) await rm(path, { force: true });
}
