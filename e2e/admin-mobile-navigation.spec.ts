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

test('mobile admin navigation exposes five focused actions and the secondary menu', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/admin/inicio');

  const bottomNav = page.getByTestId('admin-bottom-nav');
  await expect(bottomNav).toBeVisible();
  await expect(bottomNav.locator(':scope > .bottom-nav__item')).toHaveCount(5);
  await expect(bottomNav.getByText('Inicio', { exact: true })).toBeVisible();
  await expect(bottomNav.getByText('Clientes', { exact: true })).toBeVisible();
  await expect(bottomNav.getByText('Cita', { exact: true })).toBeVisible();
  await expect(bottomNav.getByText('Club', { exact: true })).toBeVisible();
  await expect(bottomNav.getByText('Más', { exact: true })).toBeVisible();

  for (const label of ['Servicios', 'Inventario', 'Tarjetas regalo', 'Asistente', 'Configuración']) {
    await expect(bottomNav.getByText(label, { exact: true })).toHaveCount(0);
  }

  await page.getByRole('button', { name: 'Más opciones' }).click();
  const moreMenu = page.getByRole('menu');
  for (const label of ['Servicios', 'Inventario', 'Tarjetas regalo', 'Asistente', 'Configuración']) {
    await expect(moreMenu.getByRole('menuitem', { name: label })).toBeVisible();
  }
  await expect(moreMenu.getByText('Club', { exact: true })).toHaveCount(0);
  await expect(moreMenu.getByText('Clientes', { exact: true })).toHaveCount(0);

  await moreMenu.getByRole('menuitem', { name: 'Tarjetas regalo' }).click();
  await expect(page).toHaveURL(/#\/admin\/tarjetas-regalo$/);
  await expect(page.getByRole('button', { name: 'Más opciones' })).toHaveAttribute(
    'aria-current',
    'page'
  );

  await bottomNav.getByRole('link', { name: 'Club' }).click();
  await expect(page).toHaveURL(/#\/admin\/club$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Bella Mujer Club' })).toBeVisible();

  await page.getByRole('button', { name: 'Nueva cita' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const viewport of [
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 }
]) {
  test(`mobile topbar and bottom navigation fit at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/#/admin/inicio');

    await expect(page.getByText('Panel Bella Mujer', { exact: true })).toBeVisible();
    await expect(page.locator('.topbar').getByRole('button', { name: 'Nueva cita' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Buscar' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Notificaciones' })).toBeHidden();
    await expect(page.getByTestId('admin-bottom-nav')).toBeInViewport();
    await expectNoHorizontalOverflow(page);
  });
}

test('desktop keeps the sidebar and topbar controls without a bottom navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/admin/inicio');

  await expect(page.locator('.sidenav')).toBeVisible();
  await expect(page.getByTestId('admin-bottom-nav')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Buscar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Notificaciones' })).toBeVisible();
  await expect(page.locator('.topbar').getByRole('button', { name: 'Nueva cita' })).toBeVisible();
});
