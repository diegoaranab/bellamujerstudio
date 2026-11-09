import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth
  }));

  expect(widths.body).toBeLessThanOrEqual(widths.viewport);
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
}

test('desktop Club preview renders in the authenticated admin shell', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/admin/club');

  await expect(page.getByTestId('admin-shell')).toBeVisible();
  await expect(page.getByTestId('public-shell')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Bella Mujer Club' })).toBeVisible();
  await expect(page.getByText('Vista previa').first()).toBeVisible();
  await expect(page.getByTestId('club-preview-notice')).toContainText('Datos de demostración');
  await expect(page.getByTestId('club-demo-metrics')).toContainText('Clientas Club');
  await expect(page.getByText('3 sellos acumulados', { exact: true })).toBeVisible();
});

test('mobile Club preview remains readable and is discoverable from Inicio', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/admin/club');

  await expect(page.getByRole('heading', { level: 1, name: 'Bella Mujer Club' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const bottomNav = page.getByTestId('admin-bottom-nav');
  await expect(bottomNav).toBeVisible();
  await expect(bottomNav.locator(':scope > .bottom-nav__item')).toHaveCount(5);
  await expect(bottomNav.getByRole('link', { name: 'Club' })).toBeVisible();

  await page.goto('/#/admin/inicio');
  const clubEntry = page.getByTestId('club-preview-card');
  await expect(clubEntry).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await clubEntry.getByRole('link', { name: /Explorar Club/ }).click();
  await expect(page).toHaveURL(/#\/admin\/club$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Bella Mujer Club' })).toBeVisible();
});
