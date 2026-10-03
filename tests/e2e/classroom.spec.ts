import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
test('one login, realtime vote, word selections, results, reset and next scene', async ({
  browser,
}) => {
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const phoneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const admin = await adminContext.newPage(),
    phone = await phoneContext.newPage();
  await admin.route('**/presenter?legacy=1', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'content-security-policy': "connect-src 'self' ws: wss:; img-src 'self' data: blob:;",
      },
    });
  });
  const consoleErrors: string[] = [];
  phone.on('pageerror', (e) => consoleErrors.push(e.message));
  admin.on('pageerror', (e) => consoleErrors.push(e.message));
  await admin.goto('/presenter?legacy=1');
  await admin.getByLabel('Clé présentateur').fill('demo-presenter');
  await admin.getByRole('button', { name: 'Ouvrir le tableau de bord' }).click();
  await expect(admin.getByRole('button', { name: 'Se déconnecter', exact: true })).toBeVisible();
  await expect(admin.getByRole('status').filter({ hasText: 'Connecté en direct' })).toBeVisible();
  if (await admin.getByRole('button', { name: 'Démarrer une session' }).isVisible())
    await admin.getByRole('button', { name: 'Démarrer une session' }).click();
  await expect(admin.getByLabel('Scène à activer')).toBeEnabled();
  if (await admin.getByRole('button', { name: 'Fermer le vote', exact: true }).isEnabled())
    await admin.getByRole('button', { name: 'Fermer le vote', exact: true }).click();
  await admin.getByLabel('Scène à activer').selectOption('silence');
  await admin.getByRole('button', { name: 'Réinitialiser les réponses', exact: true }).click();
  await admin.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(admin.getByRole('button', { name: 'Ouvrir le vote', exact: true })).toBeEnabled();
  await phone.goto('/');
  await expect(phone.getByRole('heading', { name: /Votre point de vue/ })).toBeVisible();
  await mkdir('docs/screenshots', { recursive: true });
  await phone.screenshot({ path: 'docs/screenshots/mobile-login.png', fullPage: true });
  await phone.getByLabel('Numéro de téléphone').fill('0610000042');
  await phone.getByLabel(/Code personnel|Code de présentation/).fill('wrong');
  await phone.getByRole('button', { name: 'Rejoindre la présentation' }).click();
  await expect(phone.getByRole('alert')).toContainText('code incorrect');
  await phone.getByLabel(/Code personnel|Code de présentation/).fill('demo1234');
  await phone.getByRole('button', { name: 'Rejoindre la présentation' }).click();
  await expect(phone.getByRole('heading', { name: 'Vous êtes connecté.' })).toBeVisible();
  await admin.getByRole('button', { name: 'Ouvrir le vote', exact: true }).click();
  await expect(
    phone.getByRole('heading', { name: 'Yassine communique-t-il malgré son silence ?' }),
  ).toBeVisible();
  await phone.getByRole('radio', { name: /Oui/ }).check();
  await phone.getByRole('button', { name: 'Silence', exact: true }).click();
  await phone.getByRole('button', { name: 'Regard', exact: true }).click();
  await phone.getByRole('button', { name: 'Posture', exact: true }).click();
  await expect(phone.getByRole('button', { name: 'Distance', exact: true })).toBeDisabled();
  await phone.screenshot({ path: 'docs/screenshots/mobile-vote.png', fullPage: true });
  // A network interruption retains a queued, idempotent submission for the same round.
  await phoneContext.setOffline(true);
  await phone.getByRole('button', { name: 'Envoyer ma réponse' }).click();
  await expect(phone.getByRole('alert')).toContainText('réessayée');
  await phoneContext.setOffline(false);
  await expect(
    phone.getByRole('heading', { name: 'Votre réponse a été enregistrée.' }),
  ).toBeVisible({ timeout: 20_000 });
  await phone.reload();
  await expect(
    phone.getByRole('heading', { name: 'Votre réponse a été enregistrée.' }),
  ).toBeVisible();
  await admin.getByRole('button', { name: 'Fermer le vote', exact: true }).click();
  await expect(phone.getByRole('heading', { name: 'Le vote est terminé.' })).toBeVisible();
  await admin.getByRole('button', { name: 'Afficher les résultats', exact: true }).click();
  await admin.getByRole('button', { name: 'Afficher le QR code', exact: true }).click();
  await admin.getByRole('tab', { name: 'Sondage', exact: true }).focus();
  await admin.keyboard.press('ArrowRight');
  await expect(admin.getByRole('tab', { name: 'Mots de la classe' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(admin.getByRole('tabpanel', { name: 'Mots de la classe' })).toContainText('Silence');
  await admin.keyboard.press('ArrowLeft');
  await expect(admin.getByRole('tab', { name: 'Sondage', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await adminContext.grantPermissions(['clipboard-read', 'clipboard-write']);
  await admin.getByRole('button', { name: 'Copier le lien de participation' }).click();
  await expect(admin.getByRole('button', { name: 'Lien copié', exact: true })).toBeVisible();
  expect(await admin.evaluate(() => navigator.clipboard.readText())).toContain('/?session=');
  await admin.evaluate(() => window.scrollTo(0, 0));
  await admin.screenshot({ path: 'work/presenter-legacy.png', fullPage: false });
  const projector = await adminContext.newPage();
  const href = await admin
    .getByRole('link', { name: 'Ouvrir l’écran de projection' })
    .getAttribute('href');
  await projector.goto(href!);
  await expect(projector.getByText('1 vote · 100 %', { exact: true })).toBeVisible();
  await projector.screenshot({ path: 'docs/screenshots/projector.png', fullPage: true });
  // Export real PNG downloads: transparent assets for styled slides, optional branded full frame.
  async function pngDownload(button: string) {
    const pending = admin.waitForEvent('download');
    await admin.getByRole('button', { name: button, exact: true }).click();
    const file = await pending;
    const src =
      'data:image/png;base64,' + (await readFile((await file.path())!)).toString('base64');
    return admin.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      return {
        width: image.width,
        height: image.height,
        alpha: ctx.getImageData(0, 0, 1, 1).data[3],
      };
    }, src);
  }
  const asset = await pngDownload('Télécharger le sondage');
  expect(asset.width).toBe(1600);
  expect(asset.height).toBeLessThan(900);
  expect(asset.alpha).toBe(0);
  const wordsAsset = await pngDownload('Télécharger le nuage');
  expect(wordsAsset.height).toBeLessThan(900);
  expect(wordsAsset.alpha).toBe(0);
  await admin.getByLabel('Graphiques transparents pour vos diapositives').uncheck();
  expect(await pngDownload('Télécharger le sondage')).toEqual({
    width: 1600,
    height: 900,
    alpha: 255,
  });
  const csvPromise = admin.waitForEvent('download');
  await admin.getByRole('button', { name: 'Exporter les résultats CSV' }).click();
  expect((await csvPromise).suggestedFilename()).toBe('paloalto-results.csv');
  await admin.getByRole('button', { name: 'Réinitialiser les réponses', exact: true }).click();
  await admin.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await admin.getByRole('button', { name: 'Ouvrir le vote', exact: true }).click();
  await expect(phone.getByRole('button', { name: 'Envoyer ma réponse' })).toBeVisible();
  await admin.getByRole('button', { name: 'Fermer le vote', exact: true }).click();
  await admin.getByRole('button', { name: 'Scène suivante' }).click();
  await admin.getByRole('button', { name: 'Ouvrir le vote', exact: true }).click();
  await expect(phone.getByRole('heading', { name: /Le ton change-t-il/ })).toBeVisible();
  expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await admin.getByRole('button', { name: 'Terminer la session' }).click();
  await admin.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(
    phone.getByRole('heading', { name: 'Merci pour votre participation.' }),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
  await adminContext.close();
  await phoneContext.close();
});
