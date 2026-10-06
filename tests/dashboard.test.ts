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
    store.resetPresentation(a, store.session(a)!.version);
    store.db.close();
    store = new Store({ ...settings, dbPath: file });
    assert.equal(store.session(a)!.state, 'WAITING');
    assert.ok(store.dashboard(a).editable);
    assert.equal(store.dashboard(a).code, 'PRESENTATION-CODE-A');
    assert.equal(store.dashboard(a).voters[0].name, 'Again');
    assert.ok(store.editorAssets(a).scenes.every((s) => s.epoch === 1 && s.results.total === 0));
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

test('private all-scene editor feed and confirmed rehearsal reset preserve roster and reject stale votes', async () => {
  const server = createApp(settings);
  await new Promise<void>((r) => server.http.listen(0, '127.0.0.1', r));
  const port = (server.http.address() as { port: number }).port;
  const api = async (path: string, token = '', body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    const a = server.store.createPresentation('editor@example.test', 'EDITOR-PRESENTATION-A', 'A');
    const b = server.store.createPresentation('other@example.test', 'EDITOR-PRESENTATION-B', 'B');
    const token = server.store.presenterToken(a),
      other = server.store.presenterToken(b);
    const config = structuredClone(server.store.config);
    config.scenes.forEach((scene) => {
      scene.voteSeconds = 0;
      scene.explanation = 'PRIVATE NOTES';
    });
    server.store.savePresentation(a, config, 1);
    server.store.savePresentation(b, config, 1);
    server.store.addVoter(a, '0612345678', 'PRIVATE NAME');
    const voter = server.store.join(a, '0612345678', 'EDITOR-PRESENTATION-A').token;
    const identity = server.store.identity(voter)!;
    if (identity.role !== 'participant') throw new Error();
    assert.equal((await api('/api/editor/assets')).status, 401);
    assert.equal((await api('/api/editor/assets', voter)).status, 403);
    assert.equal((await api('/api/editor/assets', other)).data.session, b);
    const initial = (await api('/api/editor/assets', token)).data;
    assert.equal(initial.scenes.length, config.scenes.length);
    assert.equal(initial.session, a);
    assert.ok(
      !/PRIVATE NAME|PRIVATE NOTES|0612345678|editor@example|EDITOR-PRESENTATION-A/.test(
        JSON.stringify(initial),
      ),
    );
    const command = (
      action: 'activate' | 'open' | 'close' | 'results' | 'finish' | 'reset',
      sceneId?: string,
    ) => server.store.command(a, action, server.store.session(a)!.version, sceneId);
    for (const scene of config.scenes.slice(0, 2)) {
      command('activate', scene.id);
      command('open');
      server.store.vote(identity, {
        sceneId: scene.id,
        epoch: 0,
        optionIds: [scene.poll.options[0].id],
        words: scene.words.options.slice(0, 1),
        requestId: randomUUID(),
      });
      assert.equal(
        server.store.editorAssets(a).scenes.find((s) => s.scene.id === scene.id)!.results.total,
        1,
      );
      command('close');
      command('results');
    }
    const feed = server.store.editorAssets(a);
    assert.equal(feed.scenes[0].results.total, 1);
    assert.equal(feed.scenes[1].results.total, 1);
    command('reset');
    assert.equal(server.store.editorAssets(a).scenes[0].results.total, 1);
    assert.equal(server.store.editorAssets(a).scenes[1].results.total, 0);
    command('finish');
    const version = server.store.session(a)!.version;
    assert.equal(
      (
        await api('/api/admin/reset-presentation', token, {
          expectedVersion: version,
          confirm: false,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api('/api/admin/reset-presentation', voter, {
          expectedVersion: version,
          confirm: true,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api('/api/admin/reset-presentation', token, {
          expectedVersion: version - 1,
          confirm: true,
        })
      ).status,
      409,
    );
    const restarted = await api('/api/admin/reset-presentation', token, {
      expectedVersion: version,
      confirm: true,
    });
    assert.equal(restarted.status, 200);
    assert.equal(restarted.data.editable, true);
    assert.equal(restarted.data.voters.length, 1);
    assert.equal(restarted.data.code, 'EDITOR-PRESENTATION-A');
    assert.equal(server.store.identity(voter)?.sessionId, a);
    assert.equal(server.store.session(a)!.state, 'WAITING');
    assert.equal(server.store.session(a)!.scene_index, 0);
    assert.equal(server.store.account(a)!.vote_ends_at, null);
    assert.ok(
      server.store.editorAssets(a).scenes.every((s) => s.results.total === 0 && s.epoch > 0),
    );
    assert.equal(server.store.editorAssets(b).scenes[0].epoch, 0);
    // Editing after rehearsal must retain the incremented epoch, so an old buffered ballot cannot slip in.
    server.store.savePresentation(a, config, restarted.data.revision);
    command('activate');
    command('open');
    const scene = config.scenes[0];
    assert.throws(
      () =>
        server.store.vote(identity, {
          sceneId: scene.id,
          epoch: 0,
          optionIds: [scene.poll.options[0].id],
          words: [],
          requestId: randomUUID(),
        }),
      /activité a changé/,
    );
    server.store.vote(identity, {
      sceneId: scene.id,
      epoch: server.store.epoch(server.store.session(a)!),
      optionIds: [scene.poll.options[0].id],
      words: [],
      requestId: randomUUID(),
    });
    assert.equal(server.store.editorAssets(a).scenes[0].results.total, 1);
  } finally {
    await server.close();
  }
});
