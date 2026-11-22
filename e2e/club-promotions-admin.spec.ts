import { expect, test } from '@playwright/test';
import { adminPromotionFixture, installConfiguredClubFixture } from './support/club-fixture';

for (const width of [390, 820, 1440]) {
  test(`promotion catalog is read-only and responsive at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installConfiguredClubFixture(page);
    const mutations: string[] = [];
    page.on('request', request => { if (request.url().includes('/admin/club/promotions') && request.method() !== 'GET') mutations.push(request.method()); });
    await page.goto('/#/admin/club/promociones');
    const nav = page.getByTestId('club-section-nav');
    await expect(nav.getByRole('link', { name: 'Promociones' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: adminPromotionFixture[0].title })).toBeVisible();
    await expect(page.getByText(adminPromotionFixture[0].description)).toBeVisible();
    await expect(page.getByText('Activa', { exact: true })).toBeVisible();
    await expect(page.getByText('Inactiva', { exact: true })).toBeVisible();
    await expect(page.getByText('Horarios de Ciudad de México')).toBeVisible();
    await expect(page.locator('time')).toHaveCount(4);
    await expect(page.getByRole('heading', { name: 'Promociones' })).toBeFocused();
    await expect(page.getByRole('button', { name: /crear|editar|eliminar|activar|desactivar|guardar|publicar/i })).toHaveCount(0);
    const widths = await page.evaluate(() => [document.body.scrollWidth, document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(widths[0]).toBeLessThanOrEqual(widths[2]); expect(widths[1]).toBeLessThanOrEqual(widths[2]);
    await nav.getByRole('link', { name: 'Clientas' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/admin\/club\/clientas$/);
    expect(mutations).toEqual([]);
  });
}

test('retry can be reached and activated with the keyboard', async ({ page }) => {
  await installConfiguredClubFixture(page);
  let attempts = 0;
  await page.route('**/__club_fixture__/admin/club/promotions', async route => {
    if (++attempts === 1) await route.fulfill({ status: 500, body: '{}' });
    else await route.fallback();
  });
  await page.goto('/#/admin/club/promociones');
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('heading', { name: 'Promociones' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: adminPromotionFixture[0].title })).toBeVisible();
  expect(attempts).toBe(2);
});
