import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { unzipSync } from 'fflate';
test('packaged plugin connects, opens QR window and serializes additive image insertion', async ({
  page,
}) => {
  const archive = unzipSync(await readFile('dist/paloalto-live.plugin'));
  const manifest = JSON.parse(new TextDecoder().decode(archive['config.json']));
  expect(manifest.variations[0].type).toBe('panelRight');
  expect(manifest.variations[0].EditorsSupport).toEqual(['slide']);
  for (const file of [
    'index.html',
    'window.html',
    'app.js',
    'app.css',
    'window.js',
    'window.css',
    'vendor/plugins.js',
    'icon.png',
  ])
    expect(archive[file]).toBeTruthy();
  await page.addInitScript(() => {
    const images: { src: string; width: number; height: number; x?: number; y?: number }[] = [];
    const objects: unknown[] = [{ existing: true }];
    const windows: Record<string, unknown>[] = [];
    const api = {
      GetPresentation: () => ({
        GetCurrentSlide: () => ({ AddObject: (o: unknown) => objects.push(o) }),
        GetWidth: () => 9144000,
        GetHeight: () => 5143500,
      }),
      CreateImage: (src: string, width: number, height: number) => {
        const img = { src, width, height, x: 0, y: 0 };
        images.push(img);
        return {
          ...img,
          SetPosition: (x: number, y: number) => {
            img.x = x;
            img.y = y;
          },
        };
      },
    };
    const sdk = {
      scope: {} as Record<string, unknown>,
      plugin: {
        init: () => {},
        button: () => {},
        executeMethod: () => {},
        executeCommand: () => {},
        callCommand: (
          fn: () => unknown,
          _close: boolean,
          _recalc: boolean,
          cb: (r: unknown) => void,
        ) => {
          // ONLYOFFICE serializes commands; this fresh function has no access to bundle closures.
          const run = new Function('Api', 'Asc', `return (${fn.toString()})();`);
          cb(run(api, sdk));
        },
      },
      PluginWindow: class {
        show(config: Record<string, unknown>) {
          windows.push(config);
        }
      },
    };
    Reflect.set(window, 'Asc', sdk);
    Reflect.set(window, '__pluginTest', { images, objects, windows });
  });
  await mkdir('work', { recursive: true });
  const cssUrl = pathToFileURL(resolve('onlyoffice-plugin/dist/app.css')).href;
  const jsUrl = pathToFileURL(resolve('onlyoffice-plugin/dist/app.js')).href;
  await writeFile(
    'work/plugin-harness.html',
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><link rel="stylesheet" href="${cssUrl}"></head><body><div id="root"></div><script src="${jsUrl}"></script><script>Asc.plugin.init();</script></body></html>`,
  );
  // Exercise the legacy file:// / Origin:null networking path in a real browser context.
  await page.goto(pathToFileURL(resolve('work/plugin-harness.html')).href);
  await page.getByLabel('Adresse du serveur').fill('http://localhost:3000');
  await page.getByLabel('Clé présentateur').fill('demo-presenter');
  await page.getByRole('button', { name: 'Ouvrir le tableau de bord' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'QR code en grande fenêtre' }).click();
  const windowConfig = (await page.evaluate(
    () => Reflect.get(window, '__pluginTest').windows[0],
  )) as { url: string; type: string };
  expect(windowConfig.type).toBe('window');
  expect(windowConfig.url).toContain('session=');
  expect(windowConfig.url).not.toContain('token=');
  await page.getByRole('button', { name: 'Insérer le sondage', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Image ajoutée' })).toBeVisible();
  const result = (await page.evaluate(() => {
    const t = Reflect.get(window, '__pluginTest');
    return { count: t.images.length, objects: t.objects.length, img: t.images[0] };
  })) as {
    count: number;
    objects: number;
    img: { src: string; width: number; height: number; x: number; y: number };
  };
  expect(result.count).toBe(1);
  expect(result.objects).toBe(2);
  expect(result.img.src).toMatch(/^data:image\/png;base64,/);
  expect(result.img.width / result.img.height).toBeCloseTo(16 / 9);
  expect(result.img.x).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Insérer le QR code dans la diapositive' }).click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__pluginTest').images.length))
    .toBe(2);
  const ratio = await page.evaluate(() => {
    const img = Reflect.get(window, '__pluginTest').images[1];
    return img.width / img.height;
  });
  expect(ratio).toBe(1);
  await page.getByRole('button', { name: 'Insérer le nuage de mots', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__pluginTest').images.length))
    .toBe(3);
  await page.screenshot({ path: 'docs/screenshots/plugin-harness.png', fullPage: true });
});
