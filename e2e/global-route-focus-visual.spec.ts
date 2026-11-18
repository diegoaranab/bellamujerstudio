import { expect, test } from '@playwright/test';

const adminViewports = [
  { width: 390, height: 844, label: '390x844' },
  { width: 820, height: 1180, label: '820x1180' },
  { width: 1440, height: 900, label: '1440x900' }
];

for (const viewport of adminViewports) {
  test(`admin dashboard route focus at ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/#/admin/tarjetas-regalo');
    await page.getByRole('link', { name: 'Inicio' }).click();

    const heading = page.getByRole('heading', { level: 1, name: 'Inicio' });
    await expect(heading).toBeFocused();
    await expect(page.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');

    await page.screenshot({
      path: `test-results/global-route-focus/screenshots/admin-${viewport.label}.png`,
      fullPage: true
    });
  });
}

test('public route focus remains visually quiet after navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/');
  await page.getByTestId('public-nav-services-link').click();

  await expect(page.getByRole('heading', { level: 1, name: /servicios de belleza/i })).toBeFocused();
  await expect(page.getByTestId('public-nav-services-link')).toHaveClass(/public-nav__link--active/);
});
