import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
test('prepare scenes and manual voters, return later, join with shared code and publish automatically', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 1360, height: 960 } }),
    phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const admin = await context.newPage(),
    phone = await phoneContext.newPage();
  const errors: string[] = [];
  admin.on('pageerror', (e) => errors.push(e.message));
  phone.on('pageerror', (e) => errors.push(e.message));
  const email = `teacher-${randomUUID()}@example.test`;
  await admin.goto('/presenter');
  await admin.getByRole('button', { name: 'Créer une présentation', exact: true }).click();
  await admin.getByLabel('E-mail de l’organisateur').fill(email);
  await admin.getByLabel('Titre de la présentation').fill('Communication — cours préparé');
  const code = await admin.getByLabel('Code de présentation', { exact: true }).inputValue();
  await admin.getByRole('button', { name: 'Créer la présentation', exact: true }).click();
  await expect(admin.getByRole('heading', { name: 'Communication — cours préparé' })).toBeVisible();
  await admin.getByRole('button', { name: 'Ajouter une scène', exact: true }).click();
  await admin.getByLabel('Titre de la scène').fill('Le silence');
  await admin.getByLabel('Question du sondage').fill('Le silence communique-t-il ?');
  await admin.getByLabel('Réponse 1', { exact: true }).fill('Oui');
  await admin.getByLabel('Réponse 2', { exact: true }).fill('Non');
  await admin.getByLabel('Mots proposés').fill('Silence\nRegard');
  await admin.getByLabel('Durée du vote').fill('5');
  await admin.getByLabel('Notes pour expliquer').fill('On ne peut pas ne pas communiquer.');
  await admin.getByRole('button', { name: 'Ajouter une scène', exact: true }).click();
  await admin.getByLabel('Titre de la scène').fill('La relation');
  await admin.getByLabel('Question du sondage').fill('Le contexte change-t-il le message ?');
  await admin.getByLabel('Réponse 1', { exact: true }).fill('Toujours');
  await admin.getByLabel('Réponse 2', { exact: true }).fill('Parfois');
  await admin.getByLabel('Durée du vote').fill('0');
  await admin.getByRole('button', { name: 'Monter', exact: true }).click();
  await admin.getByRole('button', { name: 'Descendre', exact: true }).click();
  await admin.getByRole('button', { name: 'Enregistrer les scènes', exact: true }).click();
  await expect(
    admin.getByRole('status').filter({ hasText: 'Enregistré sur Railway' }),
  ).toBeVisible();
  await admin.getByRole('tab', { name: /2. Votants/ }).click();
  await admin.getByLabel('Nom du votant').fill('Étudiante autorisée');
  await admin.getByLabel('Téléphone du votant').fill('0612345678');
  await admin.getByRole('button', { name: 'Ajouter / mettre à jour' }).click();
  await expect(admin.getByRole('cell', { name: 'Étudiante autorisée', exact: true })).toBeVisible();
  let failedLoad = false;
  await admin.route('**/api/admin/presentation', (route) => {
    if (!failedLoad) {
      failedLoad = true;
      return route.abort();
    }
    return route.continue();
  });
  await admin.reload();
  await expect(admin.getByRole('alert')).toBeVisible();
  await admin.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(admin.getByRole('heading', { name: 'Communication — cours préparé' })).toBeVisible();
  await expect(admin.getByLabel('Question du sondage')).toHaveValue('Le silence communique-t-il ?');
  await admin.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
  await admin.getByLabel('E-mail de l’organisateur').fill(email);
  await admin.getByLabel('Code de présentation', { exact: true }).fill(code);
  await admin.getByRole('button', { name: 'Ouvrir ma présentation' }).click();
  await admin.getByRole('tab', { name: /3. Présenter/ }).click();
  const link = await admin
    .getByRole('link', { name: 'Ouvrir l’écran de projection' })
    .getAttribute('href');
  const session = new URL(link!, 'http://localhost').searchParams.get('session');
  await phone.goto(`/?session=${session}`);
  await phone.getByLabel('Numéro de téléphone').fill('0712345678');
  await phone.getByLabel('Code de présentation', { exact: true }).fill(code);
  await phone.getByRole('button', { name: 'Rejoindre la présentation' }).click();
  await expect(phone.getByRole('alert')).toContainText('code incorrect');
  await phone.getByLabel('Numéro de téléphone').fill('0612345678');
  await phone.getByRole('button', { name: 'Rejoindre la présentation' }).click();
  await expect(phone.getByRole('heading', { name: 'Vous êtes connecté.' })).toBeVisible();
  await expect(admin.getByRole('button', { name: 'Ouvrir le vote', exact: true })).toBeEnabled();
  await admin.getByRole('button', { name: 'Ouvrir le vote', exact: true }).click();
  await expect(phone.getByRole('heading', { name: 'Le silence communique-t-il ?' })).toBeVisible();
  await phone.getByRole('radio', { name: /Oui/ }).check();
  await phone.getByRole('button', { name: 'Silence', exact: true }).click();
  await phone.getByRole('button', { name: 'Envoyer ma réponse' }).click();
  await expect(admin.getByText(/Résultats affichés · 1 réponses/)).toBeVisible({ timeout: 12000 });
  await mkdir('work', { recursive: true });
  await admin.screenshot({ path: 'work/dashboard-live.png', fullPage: false });
  await admin.getByRole('button', { name: 'Scène suivante', exact: true }).click();
  await expect(admin.getByRole('heading', { name: 'La relation', exact: true })).toBeVisible();
  await admin.getByRole('tab', { name: /1. Scènes/ }).click();
  await expect(admin.getByLabel('Question du sondage')).toBeDisabled();
  await admin.getByRole('tab', { name: /2. Votants/ }).click();
  await admin.getByRole('button', { name: 'Retirer Étudiante autorisée' }).click();
  await admin.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(phone.getByRole('button', { name: 'Rejoindre la présentation' })).toBeVisible();
  await admin.getByRole('tab', { name: /3. Présenter/ }).click();
  await admin.getByRole('button', { name: 'Terminer la présentation', exact: true }).click();
  await admin.getByRole('button', { name: 'Confirmer', exact: true }).click();
  expect(await admin.locator('body').innerText()).not.toMatch(/démo|demo-presenter/i);
  expect(await phone.locator('body').innerText()).not.toMatch(/démo|demo1234/i);
  for (const width of [320, 760, 1360]) {
    await admin.setViewportSize({ width, height: 960 });
    await admin.getByRole('tab', { name: /2. Votants/ }).click();
    expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(errors).toEqual([]);
  await context.close();
  await phoneContext.close();
});
