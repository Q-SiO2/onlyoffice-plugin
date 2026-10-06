import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('poll and handwritten cloud render consistently without crowded words or clipped PNGs', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const reactPath = '/node_modules/.vite/deps/react.js';
    const domPath = '/node_modules/.vite/deps/react-dom_client.js';
    const componentPath = '/src/components.tsx';
    const imagePath = '/src/render-results.ts';
    const [reactModule, domModule, { Results }, { resultsPng }] = await Promise.all([
      import(reactPath),
      import(domPath),
      import(componentPath),
      import(imagePath),
    ]);
    const { createElement } = reactModule.default || reactModule;
    const { createRoot } = domModule.default || domModule;
    const root = document.createElement('div');
    root.style.cssText = 'max-width:1100px;margin:24px auto;padding:12px';
    document.body.replaceChildren(root);
    const renderer = createRoot(root);
    const result = {
      total: 31,
      poll: ['Écoute', 'Confiance', 'Contexte', 'Relation'].map((label, i) => ({
        id: String(i),
        label,
        count: [12, 8, 6, 5][i],
        percentage: [39, 26, 19, 16][i],
      })),
      words: [
        'communication',
        'écoute',
        'confiance',
        'relation',
        'contexte',
        'silence',
        'émotions',
        'respect',
        'expression',
        'compréhension',
        'gestes',
        'dialogue',
        'attention',
        'interaction',
        'message',
        'regard',
        'posture',
        'distance',
        'intonation',
        'échange',
        'influence',
        'réponse',
        'interprétation',
        'réciprocité',
      ].map((word, i) => ({ word, count: Math.max(1, 31 - i * 2) })),
    };
    const render = () =>
      renderer.render(
        createElement(Results, {
          results: result,
          question: 'Qu’est-ce qui compte dans la communication ?',
          wordPrompt: 'Les mots de la classe',
        }),
      );
    render();
    Reflect.set(window, '__aesthetic', { result, render, resultsPng });
  });
  await expect.poll(() => page.locator('.word').count()).toBeGreaterThan(0);
  expect(await page.locator('.word').count()).toBeLessThanOrEqual(24);
  const colors = await page
    .locator('.bar-fill')
    .evaluateAll((bars) => bars.map((bar) => getComputedStyle(bar).backgroundColor));
  expect([...colors].sort()).toEqual(
    ['rgb(255, 200, 61)', 'rgb(52, 82, 245)', 'rgb(255, 184, 198)', 'rgb(246, 90, 69)'].sort(),
  );
  expect(
    await page
      .locator('.word')
      .first()
      .evaluate((word) => getComputedStyle(word).fontFamily),
  ).toContain('Ink Free');
  expect(
    await page
      .locator('.word')
      .first()
      .evaluate((word) => getComputedStyle(word).fontWeight),
  ).toBe('400');
  expect(
    await page
      .locator('.result-card h2')
      .first()
      .evaluate((word) => getComputedStyle(word).fontFamily),
  ).toContain('Manrope');
  await page.setViewportSize({ width: 1200, height: 1100 });
  await mkdir('work', { recursive: true });
  await page.screenshot({ path: 'work/results-aesthetic.png', fullPage: true });
  const pngs = await page.evaluate(async () => {
    const { result, resultsPng } = Reflect.get(window, '__aesthetic');
    return {
      poll: await resultsPng(result, '', 'poll', { chartOnly: true, crop: false, height: 635 }),
      words: await resultsPng(result, '', 'words', { chartOnly: true, crop: false, height: 560 }),
    };
  });
  for (const [kind, url] of Object.entries(pngs))
    await writeFile(`work/${kind}-aesthetic.png`, Buffer.from(url.split(',')[1], 'base64'));
  await page.evaluate(() => {
    const { result, render } = Reflect.get(window, '__aesthetic');
    result.total = 32;
    result.poll[0].count++;
    result.poll[0].percentage = 40;
    result.words = Array.from({ length: 30 }, (_, i) => ({
      word: `${'W'.repeat(30)}${i}`,
      count: i ? 1 : 10000,
    }));
    render();
  });
  await expect(page.locator('.bar-label').first()).toContainText('40 %');
  expect(
    await page
      .locator('.bar-fill')
      .evaluateAll((bars) => bars.map((bar) => getComputedStyle(bar).backgroundColor)),
  ).toEqual(colors);
  for (const width of [320, 390, 760, 1200]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.locator('.word').count()).toBeGreaterThan(0);
    await expect
      .poll(() =>
        page.locator('.word-cloud').evaluate((cloud) => {
          const frame = cloud.getBoundingClientRect();
          const boxes = Array.from(cloud.querySelectorAll('.word')).map((word) =>
            word.getBoundingClientRect(),
          );
          return boxes.every(
            (a, i) =>
              a.left >= frame.left &&
              a.right <= frame.right + 1 &&
              boxes.every(
                (b, j) =>
                  i === j ||
                  a.right + 8 <= b.left ||
                  b.right + 8 <= a.left ||
                  a.bottom + 8 <= b.top ||
                  b.bottom + 8 <= a.top,
              ),
          );
        }),
      )
      .toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  const canvasSafe = await page.evaluate(async () => {
    const stylePath = '/src/result-style.ts';
    const { layoutCloud, cloudFont } = await import(stylePath);
    await document.fonts.load(`40px ${cloudFont}`);
    const context = document.createElement('canvas').getContext('2d')!;
    const words = Reflect.get(window, '__aesthetic').result.words;
    const area = { x: 85, y: 40, width: 1430, height: 435 };
    const layout = layoutCloud(words, area, (word: string, size: number) => {
      context.font = `${size}px ${cloudFont}`;
      const m = context.measureText(word);
      return {
        left: Math.max(0, m.actualBoundingBoxLeft),
        right: Math.max(m.width, m.actualBoundingBoxRight),
        ascent: Math.max(size * 0.75, m.actualBoundingBoxAscent),
        descent: Math.max(size * 0.25, m.actualBoundingBoxDescent),
      };
    });
    return (
      layout.items.length > 0 &&
      layout.hidden > 0 &&
      layout.items.every(
        (a: { bounds: { x: number; y: number; width: number; height: number } }, i: number) => {
          const b = a.bounds;
          return (
            b.x >= 85 &&
            b.x + b.width <= 1515.01 &&
            b.y >= 40 &&
            b.y + b.height <= 475.01 &&
            layout.items.every((other: typeof a, j: number) => {
              const c = other.bounds;
              return (
                i === j ||
                b.x + b.width + 33.9 <= c.x ||
                c.x + c.width + 33.9 <= b.x ||
                b.y + b.height + 23.9 <= c.y ||
                c.y + c.height + 23.9 <= b.y
              );
            })
          );
        },
      )
    );
  });
  expect(canvasSafe).toBe(true);
  expect(errors).toEqual([]);
});
