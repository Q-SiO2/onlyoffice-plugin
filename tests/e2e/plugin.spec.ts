import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { unzipSync } from 'fflate';
import { randomUUID } from 'node:crypto';
import type { Snapshot, Action } from '../../shared/model.ts';
test('asset tray is read-only, follows website results and inserts transparent movable images', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 420 });
  const archive = unzipSync(await readFile('dist/paloalto-live.plugin'));
  const manifest = JSON.parse(new TextDecoder().decode(archive['config.json']));
  expect(manifest.variations[0].type).toBe('panelRight');
  expect(manifest.version).toBe('1.1.0');
  expect(manifest.minVersion).toBe('9.3.0');
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
    'vendor/licenses/UNLUMEN-MIT.txt',
    'vendor/licenses/MANROPE-OFL.txt',
  ])
    expect(archive[file]).toBeTruthy();
  expect(Object.keys(archive).some((file) => file.endsWith('.woff2'))).toBe(true);
  await page.addInitScript(() => {
    const images: {
      src: string;
      width: number;
      height: number;
      x: number;
      y: number;
      name: string;
      rotation: number;
    }[] = [];
    const existing = {
      existing: true,
      GetName: () => 'Existing decoration',
      SetFill: () => {
        throw new Error('An unrelated object must never be changed');
      },
    };
    const objects: unknown[] = [existing];
    const unrelated = [
      {
        GetName: () => 'PaloAltoLive:v1:https%3A%2F%2Fother.example:silence:poll:foreign',
        SetFill: existing.SetFill,
      },
      {
        GetName: () => 'PaloAltoLive:v1:http%3A%2F%2Flocalhost%3A5173:future:poll:another-scene',
        SetFill: existing.SetFill,
      },
    ];
    const slide = { AddObject: (o: unknown) => objects.push(o), GetAllShapes: () => objects };
    const api = {
      GetPresentation: () => ({
        GetCurrentSlide: () => slide,
        GetAllSlides: () => [slide, { GetAllShapes: () => unrelated }],
        GetWidth: () => 9144000,
        GetHeight: () => 5143500,
      }),
      CreateBlipFill: (src: string) => ({ src }),
      CreateNoFill: () => ({}),
      CreateStroke: () => ({}),
      CreateShape: (_type: string, width: number, height: number, fill: { src: string }) => {
        const img = {
          src: fill.src,
          width,
          height,
          x: 0,
          y: 0,
          name: '',
          rotation: 0,
          SetPosition: (x: number, y: number) => {
            img.x = x;
            img.y = y;
          },
          Select: () => {
            Reflect.set(window, '__selectedAsset', img);
            return true;
          },
          SetName: (name: string) => {
            img.name = name;
            return true;
          },
          GetName: () => img.name,
          SetFill: (next: { src: string }) => {
            img.src = next.src;
            return true;
          },
        };
        images.push(img);
        return img;
      },
    };
    let running = 0;
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
          running++;
          if (running > 1) Reflect.set(window, '__overlappingCommands', true);
          // A delayed host reads Asc.scope only when execution starts.
          setTimeout(() => {
            const result = run(api, sdk);
            running--;
            cb(result);
          }, 50);
        },
      },
    };
    Reflect.set(window, 'Asc', sdk);
    Reflect.set(window, '__pluginTest', { images, objects });
  });
  await mkdir('work', { recursive: true });
  const cssUrl = pathToFileURL(resolve('onlyoffice-plugin/dist/app.css')).href;
  const jsUrl = pathToFileURL(resolve('onlyoffice-plugin/dist/app.js')).href;
  await writeFile(
    'work/plugin-harness.html',
    `<!doctype html><html lang="fr" class="paloalto-plugin" style="overflow:hidden"><head><meta charset="utf-8"><link rel="stylesheet" href="${cssUrl}"></head><body style="overflow:hidden"><div id="root" role="region" aria-label="Panneau Palo Alto Live" tabindex="0"></div><script src="${jsUrl}"></script><script>Asc.plugin.init();</script></body></html>`,
  );
  // Exercise the legacy file:// / Origin:null networking path in a real browser context.
  await page.goto(pathToFileURL(resolve('work/plugin-harness.html')).href);
  const pageRequests: { path: string; auth?: string }[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/'))
      pageRequests.push({ path: r.url(), auth: r.headers().authorization });
  });
  async function api<T>(path: string, token = '', body?: unknown): Promise<T> {
    const response = await fetch('http://localhost:3000' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    expect(response.ok).toBe(true);
    return response.json() as Promise<T>;
  }
  const admin = (await api<{ token: string }>('/api/admin/login', '', { key: 'demo-presenter' }))
    .token;
  let state = await api<Snapshot>('/api/state', admin);
  if (!state.session || state.state === 'FINISHED') {
    await api('/api/admin/start', admin, {});
    state = await api('/api/state', admin);
  }
  async function command(action: Action, sceneId?: string) {
    state = await api<Snapshot>('/api/admin/command', admin, {
      action,
      sceneId,
      expectedVersion: state.version,
      confirm: true,
    });
  }
  if (state.state === 'VOTING_OPEN') await command('close');
  await command('activate', 'silence');
  await command('reset');
  await page.getByLabel('Lien de la présentation').fill(state.joinUrl);
  await page.getByRole('button', { name: 'Charger les graphiques' }).click();
  await expect(page.getByText('Maquette · en attente des résultats publiés')).toBeVisible();
  await expect(page.getByLabel('Clé présentateur')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ouvrir le vote', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Démarrer une session' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ajouter le sondage' })).toBeEnabled();
  // The editor host can lock body/document scrolling. Wheel and keyboard must scroll our panel.
  await page.mouse.move(180, 300);
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => page.locator('#root').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  await page.locator('#root').focus();
  await page.keyboard.press('Control+End');
  await expect
    .poll(() =>
      page.locator('#root').evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop),
    )
    .toBeLessThan(2);
  await page.screenshot({ path: 'docs/screenshots/plugin-scroll-bottom.png', fullPage: false });
  const before = await page.getByAltText('Aperçu du sondage').getAttribute('src');
  // Place a preview, then mimic the presenter moving/resizing/rotating it on a designed slide.
  await page.getByRole('button', { name: 'Ajouter le sondage', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Image sélectionnée' })).toBeVisible();
  await page.evaluate(() => {
    const image = Reflect.get(window, '__pluginTest').images[0];
    Object.assign(image, { x: 123456, y: 654321, width: 2000000, height: 631250, rotation: 17 });
    Reflect.set(window, '__selectedAsset', 'existing-text');
  });
  await command('open');
  const participant = (
    await api<{ token: string }>('/api/join', '', {
      sessionId: state.session,
      phone: '0610000042',
      pin: 'demo1234',
    })
  ).token;
  await api('/api/vote', participant, {
    sceneId: 'silence',
    epoch: state.epoch,
    optionIds: ['oui'],
    words: ['Silence', 'Regard'],
    requestId: randomUUID(),
  });
  await command('close');
  await expect(page.getByText('Résultats publiés', { exact: true })).toHaveCount(0);
  await command('results');
  await expect(page.getByText('Résultats publiés', { exact: true })).toBeVisible();
  await expect
    .poll(() => page.getByAltText('Aperçu du sondage').getAttribute('src'))
    .not.toBe(before);
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__pluginTest').images[0].src))
    .not.toBe(before);
  const preserved = await page.evaluate(() => {
    const image = Reflect.get(window, '__pluginTest').images[0];
    return {
      x: image.x,
      y: image.y,
      width: image.width,
      height: image.height,
      rotation: image.rotation,
      count: Reflect.get(window, '__pluginTest').images.length,
      selection: Reflect.get(window, '__selectedAsset'),
    };
  });
  expect(preserved).toEqual({
    x: 123456,
    y: 654321,
    width: 2000000,
    height: 631250,
    rotation: 17,
    count: 1,
    selection: 'existing-text',
  });
  // Adding a second copy intentionally adds an object; live refresh must not do so.
  await page.getByRole('button', { name: 'Ajouter le sondage', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Image sélectionnée' })).toBeVisible();
  const result = (await page.evaluate(() => {
    const t = Reflect.get(window, '__pluginTest');
    return {
      count: t.images.length,
      objects: t.objects.length,
      img: t.images[1],
      uniqueNames: new Set(t.images.map((i: { name: string }) => i.name)).size,
    };
  })) as {
    count: number;
    objects: number;
    uniqueNames: number;
    img: { src: string; width: number; height: number; x: number; y: number };
  };
  expect(result.count).toBe(2);
  expect(result.objects).toBe(3);
  expect(result.uniqueNames).toBe(2);
  expect(result.img.src).toMatch(/^data:image\/png;base64,/);
  expect(result.img.width / result.img.height).toBeGreaterThan(16 / 9);
  expect(result.img.width).toBeLessThan(9144000 * 0.5);
  expect(result.img.x).toBeGreaterThan(0);
  expect(await page.evaluate(() => Reflect.get(window, '__selectedAsset').src)).toBe(
    result.img.src,
  );
  const pixels = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    return {
      corner: ctx.getImageData(0, 0, 1, 1).data[3],
      content: ctx.getImageData(100, 100, 1, 1).data[3],
      height: image.height,
    };
  }, result.img.src);
  expect(pixels.corner).toBe(0);
  expect(pixels.content).toBeGreaterThan(0);
  expect(pixels.height).toBeLessThan(900);
  await page.getByRole('button', { name: 'Ajouter le QR code' }).click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__pluginTest').images.length))
    .toBe(3);
  const ratio = await page.evaluate(() => {
    const img = Reflect.get(window, '__pluginTest').images[2];
    return img.width / img.height;
  });
  expect(ratio).toBe(1);
  await page.getByRole('button', { name: 'Ajouter le nuage de mots', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__pluginTest').images.length))
    .toBe(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.brand-icon')).toHaveJSProperty('naturalWidth', 56);
  expect(pageRequests.length).toBeGreaterThan(0);
  expect(pageRequests.every((r) => r.path.includes('/api/public/state') && !r.auth)).toBe(true);
  const darkBefore = await page.evaluate(() => Reflect.get(window, '__pluginTest').images[0].src);
  await page.getByLabel('Texte blanc pour une diapositive sombre').check();
  await expect(page.locator('.asset-preview.dark')).toHaveCount(2);
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__pluginTest').images[0].src))
    .not.toBe(darkBefore);
  const darkPoll = await page.evaluate(() => Reflect.get(window, '__pluginTest').images[0].src);
  await page.setViewportSize({ width: 360, height: 1200 });
  await page.locator('#root').focus();
  await page.keyboard.press('Control+Home');
  await page.locator('#root').evaluate((el) => el.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/screenshots/asset-tray.png', fullPage: false });
  await command('hide');
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__pluginTest').images[0].src))
    .not.toBe(darkPoll);
  await command('results');
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__pluginTest').images[0].src))
    .toBe(darkPoll);
  await command('next');
  await expect(page.getByText('Contenu et relation', { exact: true })).toBeVisible();
  await expect(page.getByText('Résultats publiés', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ajouter le sondage', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__pluginTest').images.length))
    .toBe(5);
  expect(await page.evaluate(() => Reflect.get(window, '__pluginTest').images[0].src)).toBe(
    darkPoll,
  );
  // Reuse the same deck in a fresh session. Scene bindings persist, and QR follows the new join URL.
  const oldQr = await page.evaluate(() => Reflect.get(window, '__pluginTest').images[2].src);
  await command('finish');
  await api('/api/admin/start', admin, {});
  state = await api<Snapshot>('/api/state', admin);
  await command('activate', 'silence');
  await page.getByRole('button', { name: 'Changer le lien' }).click();
  await page.getByLabel('Lien de la présentation').fill('http://localhost:5173');
  await page.getByRole('button', { name: 'Charger les graphiques' }).click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__pluginTest').images[2].src))
    .not.toBe(oldQr);
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__pluginTest').images[0].src))
    .not.toBe(darkPoll);
  expect(await page.evaluate(() => Reflect.get(window, '__pluginTest').images.length)).toBe(5);
  expect(await page.evaluate(() => Reflect.get(window, '__pluginTest').objects.length)).toBe(6);
  expect(await page.evaluate(() => Reflect.get(window, '__overlappingCommands'))).toBeUndefined();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 420 });
  await page.locator('#root').focus();
  await page.keyboard.press('Control+Home');
  await page.screenshot({ path: 'docs/screenshots/plugin-harness.png', fullPage: false });
});
