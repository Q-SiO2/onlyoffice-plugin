import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { Store } from '../backend/src/store.ts';
import { createApp } from '../backend/src/app.ts';
import type { Settings } from '../backend/src/settings.ts';
const settings: Settings = {
  demo: false,
  dbPath: ':memory:',
  scenesPath: 'shared/scenes.json',
  publicUrl: 'http://localhost:5173',
  adminKey: 'test-only-master-secret-long-enough',
  phoneSecret: 'test-only-phone-encryption-secret-long',
  origins: ['http://localhost:5173'],
  port: 0,
  host: '127.0.0.1',
  trustProxy: 0,
  retentionDays: 30,
};
test('prepared presentation, roster, login and server countdown survive restart; scoped removal revokes tokens', () => {
  mkdirSync('work', { recursive: true });
  const file = `work/dashboard-${randomUUID()}.sqlite`;
  let store = new Store({ ...settings, dbPath: file });
  try {
    const a = store.createPresentation(
      'teacher@example.test',
      'PRESENTATION-CODE-A',
      'Prepared class',
    );
    const b = store.createPresentation('other@example.test', 'PRESENTATION-CODE-B', 'Other class');
    const token = store.loginPresentation('teacher@example.test', 'PRESENTATION-CODE-A');
    assert.equal(store.identity(token)?.sessionId, a);
    assert.throws(() => store.loginPresentation('other@example.test', 'PRESENTATION-CODE-A'));
    const config = structuredClone(store.config);
    config.scenes[0].explanation = 'Private organizer notes';
    config.scenes[0].voteSeconds = 1;
    const saved = store.savePresentation(a, config, 1);
    assert.equal(saved.revision, 2);
    assert.throws(() => store.savePresentation(a, config, 1));
    store.preview(a, config.scenes[1].id);
    assert.ok(store.dashboard(a).editable);
    store.preview(a, config.scenes[0].id);
    store.addVoter(a, '0612345678', 'Student A');
    store.addVoter(b, '0712345678', 'Student B');
    store.addVoter(a, '+212612345678', 'Updated A');
    assert.equal(store.dashboard(a).voters.length, 1);
    assert.throws(() => store.join(a, '0712345678', 'PRESENTATION-CODE-A'));
    assert.throws(() => store.join(a, '0612345678', 'PRESENTATION-CODE-B'));
    const voter = store.join(a, '0612345678', 'PRESENTATION-CODE-A').token;
    assert.equal(store.snapshot(store.identity(token)).eligible, 1);
    assert.equal(store.snapshot(store.identity(token)).session, a);
    assert.equal(store.snapshot().session, b);
    assert.ok(!JSON.stringify(store.snapshot(undefined, a)).includes('Updated A'));
    assert.ok(!JSON.stringify(store.snapshot(undefined, a)).includes('Private organizer notes'));
    const privateRows = JSON.stringify(store.db.prepare('SELECT * FROM presentation_voters').all());
    assert.ok(!privateRows.includes('0612345678'));
    const credentials = JSON.stringify(
      store.db.prepare('SELECT * FROM presentation_accounts').all(),
    );
    assert.ok(!credentials.includes('PRESENTATION-CODE-A'));
    store.command(a, 'activate', store.session(a)!.version);
    store.command(a, 'open', store.session(a)!.version);
    const id = store.identity(voter)!;
    if (id.role !== 'participant') throw new Error();
    const scene = config.scenes[0];
    store.vote(id, {
      sceneId: scene.id,
      epoch: 0,
      optionIds: [scene.poll.options[0].id],
      words: [],
      requestId: randomUUID(),
    });
    store.db
      .prepare('UPDATE presentation_accounts SET vote_ends_at=? WHERE session_id=?')
      .run(Date.now() - 1, a);
    store.db.close();
    store = new Store({ ...settings, dbPath: file });
    assert.equal(store.identity(token)?.sessionId, a);
    assert.equal(store.dashboard(a).voters[0].name, 'Updated A');
    assert.ok(store.tick());
    assert.equal(store.session(a)!.state, 'RESULTS');
    assert.equal(store.snapshot(undefined, a).results?.total, 1);
    assert.throws(() => store.savePresentation(a, config, 2));
    store.removeVoter(a, store.dashboard(a).voters[0].id);
    assert.equal(store.identity(voter), undefined);
    assert.equal(store.snapshot(undefined, a).results?.total, 1);
    store.addVoter(a, '0612345678', 'Again');
    assert.equal(store.identity(voter), undefined);
  } finally {
    store.db.close();
    for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true });
  }
});
test('HTTP dashboard credentials and all presenter operations stay scoped; public roles cannot edit', async () => {
  const server = createApp(settings);
  await new Promise<void>((r) => server.http.listen(0, '127.0.0.1', r));
  const port = (server.http.address() as { port: number }).port;
  const api = async (path: string, token = '', body?: unknown, method?: string) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  };
  try {
    const a = await api('/api/presentations', '', {
        email: 'a@example.test',
        code: 'PRESENTATION-CODE-A',
        title: 'A',
      }),
      b = await api('/api/presentations', '', {
        email: 'b@example.test',
        code: 'PRESENTATION-CODE-B',
        title: 'B',
      });
    assert.equal(a.status, 200);
    const at = a.data.token,
      bt = b.data.token;
    const da = (await api('/api/admin/presentation', at)).data,
      db = (await api('/api/admin/presentation', bt)).data;
    assert.notEqual(da.session, db.session);
    assert.equal((await api('/api/admin/presentation')).status, 401);
    await api('/api/admin/presentation', at, { config: server.store.config, revision: 1 });
    await api('/api/admin/voters', at, { phone: '0612345678', name: 'Allowed' });
    assert.equal(
      (await api('/api/admin/voters', at, { phone: '123', name: 'Invalid' })).status,
      400,
    );
    const joined = await api('/api/presentations/join', '', {
      phone: '0612345678',
      code: 'PRESENTATION-CODE-A',
    });
    assert.equal(joined.status, 200);
    assert.equal((await api('/api/admin/presentation', joined.data.token)).status, 403);
    assert.equal(
      (
        await api('/api/presentations/join', '', {
          phone: '0612345678',
          code: 'PRESENTATION-CODE-B',
        })
      ).status,
      401,
    );
    assert.equal((await api(`/api/admin/export?session=${db.session}`, at)).status, 403);
    assert.equal(
      (await api(`/api/admin/session/${db.session}`, at, { confirm: true }, 'DELETE')).status,
      403,
    );
    assert.equal((await api('/api/state', at)).data.session, da.session);
    assert.equal(
      (
        await api('/api/presentations/login', '', {
          email: 'wrong@example.test',
          code: 'PRESENTATION-CODE-A',
        })
      ).status,
      401,
    );
    await api('/api/admin/logout', at, {});
    assert.equal((await api('/api/admin/presentation', at)).status, 401);
  } finally {
    await server.close();
  }
});
