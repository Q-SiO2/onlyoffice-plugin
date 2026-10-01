import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePhone } from '../shared/phone.ts';
import { configSchema, transition, aggregate } from '../shared/model.ts';
const scene = configSchema.parse(JSON.parse(readFileSync('shared/scenes.json', 'utf8'))).scenes[0];
test('Moroccan phone forms normalize consistently', () => {
  for (const p of [
    '0612345678',
    '+212612345678',
    '00212612345678',
    '+212 6 12 34 56 78',
    '06-12-34-56-78',
  ])
    assert.equal(normalizePhone(p), '+212612345678');
  for (const p of ['0712345678', '+212712345678', '00212712345678'])
    assert.equal(normalizePhone(p), '+212712345678');
});
test('invalid and foreign numbers fail rather than being silently changed', () => {
  for (const p of [
    '0512345678',
    '612345678',
    '212612345678',
    '+33612345678',
    '06123456789',
    'abc0612345678',
    '++212612345678',
    '',
  ])
    assert.throws(() => normalizePhone(p));
});
test('state machine rejects results while voting and requires explicit close', () => {
  assert.equal(transition('WAITING', 'activate'), 'SCENE_ACTIVE');
  assert.equal(transition('SCENE_ACTIVE', 'open'), 'VOTING_OPEN');
  assert.throws(() => transition('VOTING_OPEN', 'results'));
  assert.throws(() => transition('VOTING_OPEN', 'next'));
  assert.throws(() => transition('FINISHED', 'open'));
  assert.equal(transition('VOTING_OPEN', 'close'), 'VOTING_CLOSED');
  assert.equal(transition('VOTING_CLOSED', 'results'), 'RESULTS');
});
test('poll counts, percentages, zero votes, and word frequencies', () => {
  const a = aggregate(scene, [
    { optionIds: ['oui'], words: ['Silence', 'Regard'] },
    { optionIds: ['oui'], words: ['Silence'] },
    { optionIds: ['non'], words: [] },
  ]);
  assert.deepEqual(
    a.poll.map((p) => [p.count, p.percentage]),
    [
      [2, 66.7],
      [1, 33.3],
      [0, 0],
    ],
  );
  assert.deepEqual(a.words, [
    { word: 'Silence', count: 2 },
    { word: 'Regard', count: 1 },
  ]);
  assert.equal(aggregate(scene, []).poll[0].percentage, 0);
});
test('config rejects duplicate scenes and poll IDs and supports arbitrary scenes', () => {
  assert.throws(() => configSchema.parse({ title: 'test', scenes: [scene, scene] }));
  assert.throws(() =>
    configSchema.parse({
      title: 'test',
      scenes: [
        {
          ...scene,
          poll: { ...scene.poll, options: [scene.poll.options[0], scene.poll.options[0]] },
        },
      ],
    }),
  );
  assert.equal(
    configSchema.parse({
      title: 'test',
      scenes: Array.from({ length: 8 }, (_, i) => ({ ...scene, id: `s${i}` })),
    }).scenes.length,
    8,
  );
});
