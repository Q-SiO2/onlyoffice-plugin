import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cloudContains,
  layoutCloud,
  pollColors,
  pollPalette,
} from '../participant-app/src/result-style.ts';

test('poll shuffle uses exactly the requested palette and stays stable across vote updates', () => {
  const options = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((label, i) => ({
    id: String(i),
    label,
    count: 0,
  }));
  const colors = pollColors(options);
  assert.deepEqual([...colors].sort(), [...pollPalette].sort());
  assert.deepEqual(pollColors(options.map((option) => ({ ...option, count: 31 }))), colors);
  assert.deepEqual(pollColors(JSON.parse(JSON.stringify(options))), colors);
  const orders = new Set(
    Array.from({ length: 20 }, (_, i) =>
      pollColors(options.map((option) => ({ ...option, label: `${option.label} ${i}` }))).join(','),
    ),
  );
  assert.ok(orders.size > 1, 'Different questions should receive different shuffles');
  assert.equal(
    pollColors([...options, { id: '4', label: 'Echo' }])[4],
    pollColors([...options, { id: '4', label: 'Echo' }])[0],
  );
});

test('cloud keeps every glyph inside its frame and separate, even with long words and dominant frequencies', () => {
  for (const height of [180, 320, 435, 600]) {
    const area = { x: 85, y: 40, width: 1430, height };
    const words = Array.from({ length: 50 }, (_, i) => ({
      word: `${'W'.repeat(i % 3 ? 30 : 5)}${i}`,
      count: i ? 1 : 10000,
    }));
    // Overhanging capitals and deep descenders deliberately exceed nominal font metrics.
    const cloud = layoutCloud(words, area, (word, size) => ({
      left: size * 0.2,
      right: word.length * size * 0.85,
      ascent: size * 1.1,
      descent: size * 0.4,
    }));
    assert.ok(cloud.items.length > 0);
    assert.ok(cloud.items.length <= 24);
    assert.equal(cloud.hidden + cloud.items.length, words.length);
    for (const item of cloud.items) {
      assert.ok(item.size >= 32, 'Crowding must not shrink words below the readable minimum');
      const box = item.bounds;
      assert.ok(box.x >= area.x && box.y >= area.y);
      assert.ok(box.x + box.width <= area.x + area.width + 0.001);
      assert.ok(box.y + box.height <= area.y + area.height + 0.001);
      for (let step = 0; step <= 6; step++) {
        const fraction = step / 6;
        for (const [x, y] of [
          [box.x + box.width * fraction, box.y],
          [box.x + box.width * fraction, box.y + box.height],
          [box.x, box.y + box.height * fraction],
          [box.x + box.width, box.y + box.height * fraction],
        ]) {
          assert.ok(
            cloudContains((x - area.x) / area.width, (y - area.y) / area.height),
            'Every word must stay inside the cloud silhouette',
          );
        }
      }
      for (const other of cloud.items) {
        if (item === other) continue;
        const b = other.bounds;
        assert.ok(
          box.x + box.width + 33.9 <= b.x ||
            b.x + b.width + 33.9 <= box.x ||
            box.y + box.height + 23.9 <= b.y ||
            b.y + b.height + 23.9 <= box.y,
          'Words must retain a gutter on at least one axis',
        );
      }
    }
  }
  assert.deepEqual(
    layoutCloud([], { x: 0, y: 0, width: 100, height: 100 }, () => {
      throw new Error('No words to measure');
    }),
    { items: [], hidden: 0 },
  );
});
