import { test, expect } from '@playwright/test';

test('join and presenter login stay readable on small phones with reduced motion', async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [320, 390, 760]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.getByLabel('Numéro de téléphone')).toBeVisible();
    await expect(page.locator('.brand-icon')).toHaveJSProperty('naturalWidth', 56);
    const alignment = await page.locator('.brand').evaluate((brand) => {
      const icon = brand.querySelector('img')!.getBoundingClientRect();
      const text = brand.querySelector('.brand-name')!.getBoundingClientRect();
      return {
        square: Math.abs(icon.width - icon.height),
        center: Math.abs(icon.y + icon.height / 2 - text.y - text.height / 2),
      };
    });
    expect(alignment.square).toBeLessThan(1);
    expect(alignment.center).toBeLessThan(1);
    await expect(page.getByLabel(/Code personnel|Code de présentation/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rejoindre la présentation' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.goto('/presenter');
    await expect(page.getByLabel('E-mail de l’organisateur')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  );
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain(
    'Manrope',
  );
  expect(errors).toEqual([]);
  await context.close();
});
