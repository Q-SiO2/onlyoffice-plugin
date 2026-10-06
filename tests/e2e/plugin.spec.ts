import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { unzipSync } from 'fflate';
import { randomUUID } from 'node:crypto';
import type { Snapshot, Action } from '../../shared/model.ts';
test('editor email login loads all prepared scenes; live poll and cloud fills survive reset, reconnect and session changes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 420 });
  const archive = unzipSync(await readFile('dist/paloalto-live.plugin'));
  const manifest = JSON.parse(new TextDecoder().decode(archive['config.json']));
  expect(manifest.variations[0].type).toBe('panelRight');
  expect(manifest.version).toBe('1.2.2');
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
    // Older desktop schemes omit secure-context randomUUID but support getRandomValues.
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
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
    const otherSlide = {
      AddObject: (o: unknown) => unrelated.push(o as (typeof unrelated)[number]),
      GetAllShapes: () => unrelated,
    };
    let currentSlide = slide;
    Reflect.set(window, '__selectSlide', (index: number) => {
      currentSlide = index ? otherSlide : slide;
    });
    const api = {
      GetPresentation: () => ({
        GetCurrentSlide: () => currentSlide,
        GetAllSlides: () => [slide, otherSlide],
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

  const email = `plugin-${randomUUID()}@example.test`,
    code = `PLUGIN-${randomUUID()}`;
  const admin = (
    await api<{ token: string }>('/api/presentations', '', {
      email,
      code,
      title: 'Prepared editor presentation',
    })
  ).token;
  const config = JSON.parse(await readFile('shared/scenes.json', 'utf8'));
  config.scenes = config.scenes.slice(0, 2);
  config.scenes.forEach((s: { voteSeconds: number }) => (s.voteSeconds = 0));
  await api('/api/admin/presentation', admin, { config, revision: 1 });
  await api('/api/admin/voters', admin, { phone: '0610000042', name: 'Editor tester' });
  let state = await api<Snapshot>('/api/state', admin);
  async function command(action: Action, sceneId?: string) {
    state = await api<Snapshot>('/api/state', admin);
    state = await api<Snapshot>('/api/admin/command', admin, {
      action,
      sceneId,
      expectedVersion: state.version,
      confirm: true,
    });
  }
  const jsErrors: string[] = [];
  page.on('pageerror', (e) => jsErrors.push(e.message));
  await page.getByText('Adresse du serveur', { exact: true }).click();
  await page.getByLabel('Serveur', { exact: true }).fill('http://localhost:5173');
  await page.getByLabel('E-mail de l’organisateur').fill(email);
  await page.getByLabel('Code de présentation').fill('WRONG-PRESENTATION-CODE');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('E-mail ou code incorrect');
  await page.getByLabel('Code de présentation').fill(code);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByLabel('Scène à placer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter le sondage' })).toBeEnabled();
  expect(state.state).toBe('WAITING');
  expect(await api<{ editable: boolean }>('/api/admin/presentation', admin)).toMatchObject({
    editable: true,
  });
  await expect(page.getByRole('button', { name: 'Ouvrir le vote', exact: true })).toHaveCount(0);
  const first = config.scenes[0],
    second = config.scenes[1];
  const count = () => page.evaluate(() => Reflect.get(window, '__pluginTest').images.length);
  const src = (index: number) =>
    page.evaluate((i) => Reflect.get(window, '__pluginTest').images[i].src, index);
  async function add(kind: string, expected: number) {
    await page.getByRole('button', { name: `Ajouter ${kind}`, exact: true }).click();
    await expect.poll(count).toBe(expected);
  }
  // Prepare BOTH scenes before launching any vote; the selected tray scene never controls the server.
  await add('le sondage', 1);
  await add('le nuage de mots', 2);
  await add('le QR code', 3);
  await page.getByLabel('Scène à placer').selectOption(second.id);
  await page.evaluate(() => Reflect.get(window, '__selectSlide')(1));
  await add('le sondage', 4);
  await add('le nuage de mots', 5);
  expect((await api<Snapshot>('/api/state', admin)).scene?.id).toBe(first.id);
  const baseline = await page.evaluate(() =>
    Reflect.get(window, '__pluginTest').images.map((i: { src: string }) => i.src),
  );
  await page.evaluate(() => {
    Reflect.get(window, '__pluginTest').images.forEach((image: object, i: number) =>
      Object.assign(image, {
        x: 123456 + i,
        y: 654321 + i,
        width: 2000000 + i,
        height: 631250 + i,
        rotation: 17 + i,
      }),
    );
    Reflect.set(window, '__selectedAsset', 'existing-text');
  });
  const geometry = () =>
    page.evaluate(() =>
      Reflect.get(window, '__pluginTest').images.map(
        (i: { x: number; y: number; width: number; height: number; rotation: number }) => ({
          x: i.x,
          y: i.y,
          width: i.width,
          height: i.height,
          rotation: i.rotation,
        }),
      ),
    );
  const beforeGeometry = await geometry();
  await command('activate', first.id);
  await command('open');
  const participant = (
    await api<{ token: string }>('/api/presentations/join', '', { phone: '0610000042', code })
  ).token;
  async function vote() {
    const scene = state.scene!;
    await api('/api/vote', participant, {
      sceneId: scene.id,
      epoch: state.epoch,
      optionIds: [scene.poll.options[0].id],
      words: scene.words.options.slice(0, 1),
      requestId: randomUUID(),
    });
  }
  await vote();
  // First-scene assets must update while the tray is showing the second scene, BEFORE closing.
  await expect.poll(() => src(0)).not.toBe(baseline[0]);
  await expect.poll(() => src(1)).not.toBe(baseline[1]);
  expect(await src(3)).toBe(baseline[3]);
  const firstPoll = await src(0),
    firstCloud = await src(1);
  await command('close');
  await command('results');
  await command('next');
  await command('open');
  await vote();
  await expect.poll(() => src(3)).not.toBe(baseline[3]);
  await expect.poll(() => src(4)).not.toBe(baseline[4]);
  expect(await src(0)).toBe(firstPoll);
  expect(await src(1)).toBe(firstCloud);
  // A scene-only reset leaves the first scene intact.
  await command('reset');
  await expect.poll(() => src(3)).toBe(baseline[3]);
  await expect.poll(() => src(4)).toBe(baseline[4]);
  expect(await src(0)).toBe(firstPoll);
  await command('open');
  await vote();
  await expect.poll(() => src(3)).not.toBe(baseline[3]);
  // Lose the socket while all-scenes reset happens: reconciliation must catch up after reconnect.
  await page.context().setOffline(true);
  state = await api<Snapshot>('/api/state', admin);
  await api('/api/admin/reset-presentation', admin, {
    expectedVersion: state.version,
    confirm: true,
  });
  await page.context().setOffline(false);
  await expect.poll(() => src(0), { timeout: 15000 }).toBe(baseline[0]);
  await expect.poll(() => src(1)).toBe(baseline[1]);
  await expect.poll(() => src(3)).toBe(baseline[3]);
  await expect.poll(() => src(4)).toBe(baseline[4]);
  expect(await geometry()).toEqual(beforeGeometry);
  expect(await count()).toBe(5);
  expect(await page.evaluate(() => Reflect.get(window, '__selectedAsset'))).toBe('existing-text');
  // Reload restores the scoped token, not the password, and every scene remains available.
  await page.reload();
  await expect(page.getByLabel('Scène à placer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter le sondage' })).toBeEnabled();
  expect(await page.getByLabel('Scène à placer').locator('option').count()).toBe(2);
  // Our harness loses its simulated deck on reload; real documents retain their shapes.
  await add('le sondage', 1);
  await add('le nuage de mots', 2);
  const lightPoll = await src(0);
  await page.getByLabel('Texte blanc pour une diapositive sombre').check();
  await expect(page.locator('.asset-preview.dark')).toHaveCount(2);
  await expect.poll(() => src(0)).not.toBe(lightPoll);
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
  await page.screenshot({ path: 'docs/screenshots/plugin-scroll-bottom.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Same scene IDs in another presentation must not overwrite this deck's linked shapes.
  const oldSources = await page.evaluate(() =>
    Reflect.get(window, '__pluginTest').images.map((i: { src: string }) => i.src),
  );
  const otherCode = `PLUGIN-${randomUUID()}`;
  const otherToken = (
    await api<{ token: string }>('/api/presentations', '', {
      email,
      code: otherCode,
      title: 'Other presentation',
    })
  ).token;
  await api('/api/admin/presentation', otherToken, { config, revision: 1 });
  await page.getByRole('button', { name: 'Changer de présentation' }).click();
  await page.getByLabel('Code de présentation').fill(otherCode);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ajouter le sondage' })).toBeEnabled();
  expect(
    await page.evaluate(() =>
      Reflect.get(window, '__pluginTest').images.map((i: { src: string }) => i.src),
    ),
  ).toEqual(oldSources);
  await add('le sondage', 3);
  const names = await page.evaluate(() =>
    Reflect.get(window, '__pluginTest').images.map((i: { name: string }) => i.name),
  );
  expect(new Set(names).size).toBe(3);
  expect(names[0]).toContain(`:${state.session}:`);
  expect(names[2]).not.toContain(`:${state.session}:`);
  expect(await page.evaluate(() => Reflect.get(window, '__overlappingCommands'))).toBeUndefined();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(jsErrors).toEqual([]);
  expect(
    pageRequests.filter((r) => r.path.includes('/api/editor/assets')).every((r) => !!r.auth),
  ).toBe(true);
  await page.setViewportSize({ width: 360, height: 1100 });
  await page.locator('#root').evaluate((el) => el.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/screenshots/asset-tray.png' });
});
